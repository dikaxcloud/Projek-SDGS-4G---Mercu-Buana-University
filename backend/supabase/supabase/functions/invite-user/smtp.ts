export interface SmtpSendOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function chunkBase64(b64: string, len = 76): string {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += len) out.push(b64.slice(i, i + len));
  return out.join("\r\n");
}

async function readResponse(conn: Deno.Conn, decoder: TextDecoder): Promise<string> {
  const buf = new Uint8Array(4096);
  let data = "";
  for (;;) {
    const n = await conn.read(buf);
    if (n === null) throw new Error("Koneksi SMTP terputus saat baca respons");
    data += decoder.decode(buf.subarray(0, n));
    // Check if we have a complete response: last complete line starts with 3 digits + space
    const lines = data.split("\r\n");
    if (lines.length >= 2) {
      const secondLast = lines[lines.length - 2];
      if (/^\d{3} /.test(secondLast)) break;
    }
  }
  return data;
}

async function sendCommand(
  conn: Deno.Conn,
  encoder: TextEncoder,
  decoder: TextDecoder,
  cmd: string,
  expect: RegExp,
  label: string,
): Promise<string> {
  if (cmd) {
    await conn.write(encoder.encode(cmd + "\r\n"));
  }
  const resp = await readResponse(conn, decoder);
  if (!expect.test(resp)) {
    throw new Error(`SMTP ${label} gagal: ${resp}`);
  }
  return resp;
}

export async function sendInviteEmailViaSmtp(opts: SmtpSendOptions): Promise<void> {
  const {
    host,
    port,
    user,
    pass,
    fromEmail,
    fromName,
    to,
    subject,
    html,
  } = opts;

  const conn = await Deno.connectTls({ hostname: host, port });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  try {
    // 1. Greeting
    await readResponse(conn, decoder);

    // 2. EHLO
    await sendCommand(conn, encoder, decoder, `EHLO kenanga.app`, /^250/, "EHLO");

    // 3. AUTH LOGIN
    await sendCommand(conn, encoder, decoder, "AUTH LOGIN", /^334/, "AUTH LOGIN");
    await sendCommand(conn, encoder, decoder, utf8ToBase64(user), /^334/, "AUTH USER");
    await sendCommand(conn, encoder, decoder, utf8ToBase64(pass), /^235/, "AUTH PASS");

    // 4. MAIL FROM
    await sendCommand(conn, encoder, decoder, `MAIL FROM:<${fromEmail}>`, /^250/, "MAIL FROM");

    // 5. RCPT TO
    await sendCommand(conn, encoder, decoder, `RCPT TO:<${to}>`, /^250/, "RCPT TO");

    // 6. DATA
    await sendCommand(conn, encoder, decoder, "DATA", /^354/, "DATA");

    // 7. Message
    const msgId = `<${crypto.randomUUID()}@${fromEmail.split("@")[1]}>`;
    const date = new Date().toUTCString();
    const subjectEnc = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
    const htmlB64 = chunkBase64(utf8ToBase64(html));

    const headers = [
      `From: ${fromName} <${fromEmail}>`,
      `To: <${to}>`,
      `Subject: ${subjectEnc}`,
      `Date: ${date}`,
      `Message-ID: ${msgId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ];

    const message = headers.join("\r\n") + "\r\n\r\n" + htmlB64 + "\r\n";

    // Dot-stuffing (base64 tidak mengandung titik di awal baris, tapi amanin aja)
    const stuffed = message
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? "." + l : l))
      .join("\r\n");

    await conn.write(encoder.encode(stuffed + "\r\n.\r\n"));
    await readResponse(conn, decoder); // 250 OK

    // 8. QUIT
    await sendCommand(conn, encoder, decoder, "QUIT", /^221/, "QUIT");
  } finally {
    conn.close();
  }
}