/** Splits a Server-Sent Events byte stream into the JSON strings carried by its "data:" lines. */
export class SseSplitter {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk.replace(/\r\n/g, "\n");
    const out: string[] = [];
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) out.push(data);
    }
    if (this.buf.length > 5_000_000) this.buf = ""; // never grow without bound
    return out;
  }
}
