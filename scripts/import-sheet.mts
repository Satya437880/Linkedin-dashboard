/* Imports the "responses" sheet: one prospect per row, their response as an inbound message, and the
 * category you set by hand. Idempotent (ids are sheet-<Sl no>). Run with --dry to try it on a throwaway DB.
 *   npx tsx scripts/import-sheet.mts --dry
 *   npx tsx scripts/import-sheet.mts
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { draftReplyForProspect, nextActionForProspect, summarizeProspect } from "../src/server/ai/analyze";
import { getBundle } from "../src/server/db/client";
import { openMemoryDb } from "../src/server/db/testDb";
import { activities, aiInsights, alerts, conversations, jobs, messages, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";
import { leadScore } from "../src/server/scoring/leadScore";

type Cat = "hot" | "cold" | "not_now";
// [Sl no, date, platform (L = LinkedIn, S = Sales Navigator), name, profile URL, response, category]
const ROWS: [number, string, "L" | "S", string, string, string, Cat][] = [
  [1, "Sep 24, 2026", "L", "Shrikant Bhaiya", "https://www.linkedin.com/in/ACoAAAf7sUwBx6a51N27QUZoq6ppfrkmKKPeIIg", "Sounds good.", "cold"],
  [2, "Sep 20, 2026", "L", "Brian Vacon", "https://www.linkedin.com/in/ACoAABk-oZUB6MFwpd8pmmtEachcprghu5kr6wE", "Good morning Prrithive\nIt would be nice to have a conversation about your business. I represent a production machine shop in the area. There could be some opportunities for us both.\nIf you are available this week we should have a chat at some point.", "hot"],
  [3, "Sep 23, 2026", "L", "Pat Augurusa, P.Eng.", "https://www.linkedin.com/in/ACoAAAh_LSYBtDsnNJGuTTLGM0mzORTd9ryz_qg", "I will reach out if interested, thanks", "not_now"],
  [4, "Sep 24, 2026", "L", "Shivam Kwatra", "https://www.linkedin.com/in/shivamkwatra/", "Let’s connect around Tuesday afternoon 647 -621-6728", "hot"],
  [5, "Sep 26, 2026", "L", "Jil Patel", "https://www.linkedin.com/in/ACoAADI8XuoBofQS9e-mTRB4Os0JmBlRQV0snEM", "Sure Prrithuve, we can chat over someday.\nI am based in London and usually come towards Niagara maybe once every 2 months.\nI will text you when i am planning to come that side.\nThe", "hot"],
  [6, "Oct 8, 2026", "L", "Aman Tiwana", "https://www.linkedin.com/in/ACoAADD1G7wBBGSWwDIGllfsKUYmYWbXpsLDcug", "Thanks for connecting Prithvi. I have a machine shop in Kitchener. If i could be any help do let me know. If you're around Kitchener, please do stop by our shop. What kind of equipment you have?", "hot"],
  [7, "Oct 9, 2026", "L", "Ihor Kozyak, P.L.Eng., C.E.T.", "https://www.linkedin.com/in/ACoAAALcvZ4BCsc5cB1AeOh31bMTAoIN9C1Ijcw", "At this time, I am not looking to explore new supplier relationships or manufacturing support opportunities, so I will pass on the meeting invitation. I wish you and the Maple MPSS team continued success.", "not_now"],
  [8, "Oct 8, 2026", "L", "Manoj Maurya, CAPM", "https://www.linkedin.com/in/ACoAADDs6P4BWqKmSypyntpHcOKk2jweBHeVCpo", "Thanks Prrithive, currently we are doing in house production for all the items. I will connect with you if any thing comes up.", "not_now"],
  [9, "Oct 7, 2026", "L", "Michael Firth", "https://www.linkedin.com/in/ACoAABMIa8UBVNnSyoEm66C3ys1ZydJ_Wdhaz8g", "I don't have time for a coffee chat right now, but I am open to learning more about Maple MPSS via chat or email. We typically need very small quantities (1-2 pieces). We partner with several offshore manufacturers but rely heavily on local machine shops for quick turnaround and rush work. I'd love to get some details on your standard lead times and typical freight costs.", "hot"],
  [10, "Oct 7, 2026", "L", "Robert Bell", "https://www.linkedin.com/in/ACoAAAAXi8wBsSKjpwv9SPaNNvMm3QtQKZDuz7U", "Thanks Prithive. How is business holding up for you guys? Our quote activity is solid but, it is tough getting decisions out there!", "cold"],
  [11, "Oct 7, 2026", "L", "Randy Malott", "https://www.linkedin.com/in/ACoAABtuRG8BMnx-WIfyujEYuOTUfQtTbeNWRR8", "We are very well set up already. Thanks Prrithive, will do", "not_now"],
  [12, "Oct 1, 2026", "L", "Milan Hajder", "https://www.linkedin.com/in/ACoAACSfZjIBIYmgGdCrRbn1He2oQx1Vs1P8rPA", "It sounds like there may be some overlap in the types of customers we work with. I’d be interested to understand a little more about what Maple MPSS manufactures and what type of collaboration you had in mind with LDM.", "hot"],
  [13, "Oct 6, 2026", "L", "James O.TENG", "https://www.linkedin.com/in/ACoAAAalOLgBeZu2Ev9cpNDo6Lqcgv0e363Irgg", "Hi,Prrithive, Nice to contact you ,keep touch for the great future. Kind regards, James", "cold"],
  [14, "Oct 6, 2026", "L", "Blair Stewart", "https://www.linkedin.com/in/ACoAAAGyj-ABvNrMn6SZJY7yOlev5med1n-yk8A", "Sure, what do you need for a crane system or transfer cart? We have no needs for machined parts", "not_now"],
  [15, "Oct 1, 2026", "L", "Mesfin Zeme, P.Eng.", "https://www.linkedin.com/in/ACoAAA5aiMABRQFrhISTMHdqueObhENLMLVxUIk", "Hi Prrithive: what opportunities are you working on? Sure. Let’s connect after 1 today. (shared email: zememesfin@gmail.com)", "hot"],
  [16, "Sep 28, 2026", "L", "Martin Stocker", "https://www.linkedin.com/in/ACoAAACwPbcB3l4XDNozNtAvuYJKxNR7h89eFc8", "We just put in a quote automated system.", "not_now"],
  [17, "Oct 19, 2026", "L", "Miguel A. Lopez, MSc, MBA", "https://www.linkedin.com/in/ACoAAADj_BwBs1VGzgPs9MpM2pDMr8tzI0Rr7m4", "Thank you Prrithive for reaching out. I'm looking for a job, if you hear something let me know, once I get something we can discuss business. Cheers! Miguel", "cold"],
  [18, "Oct 19, 2026", "L", "Mhd Youssef Demashkieh", "https://www.linkedin.com/in/ACoAACuKsL0BpQ8bhr6touR1Ro070aEMaQLAD0Q", "Thanks, we are good for now", "not_now"],
  [19, "Oct 19, 2026", "L", "Muthuswamy Vazhithunairaman", "https://www.linkedin.com/in/ACoAAA1UuG0BLTfXnejL4NF87XlJo7_reS7Fiws", "Hi Prrithive, Thanks for reaching out. Yes, I'd be happy to connect and discuss further. Please let me know your availability, and we can schedule a virtual coffee chat. Looking forward to speaking with you. Best regards, Muthuswamy", "hot"],
  [20, "Oct 19, 2026", "L", "Mike Punter", "https://www.linkedin.com/in/ACoAAAKya-UBQIhYkW-sUjfPCJDA8ehXR8q07Fk", "Prrithive, thank you for reaching out. At times we do need help with our backlog of laser cut parts. Can you share your email address. I would like to send a group of dxf files of laser cut parts for you to quote on. Thank you ~ Mike", "hot"],
  [21, "Oct 19, 2026", "L", "Sanju Sajan, B.Eng", "https://www.linkedin.com/in/ACoAABMbTUgBFbNqgAV8t2XdLrocoTh0GM3-Duo", "Hi Prrithive, Thanks for reaching out. I will let you know", "cold"],
  [22, "Oct 16, 2026", "L", "Simone Drera", "https://www.linkedin.com/in/ACoAAAFT9QgBGTLC209ZpguISJYZoy7Hja3luc4", "Hi Prrithive, We don't use machined parts", "not_now"],
  [23, "Oct 15, 2026", "L", "Nick Delle Donne", "https://www.linkedin.com/in/ACoAACH2AVsBa7RPxAfgQLG26ETUsAaDt73EQB8", "Hi, Prrithive. I am very busy at the moment I would not be able to meet up. I can maybe do a phone call next week? I do not have any need for machining services, we are a mechanical design house and our customers take care of the manufacturing/build. | Follow-up: 416-571-2212, does Thursday 22nd at 10am work for you? Sounds good.", "hot"],
  [25, "Oct 5, 2026", "L", "Elizabeth Stanley", "https://www.linkedin.com/in/ACoAAFhnXwsBzErXb48SG_4SZnojXdKXP9H24rE", "We're ok for now thank you. I'll reach out should we require any support though. Thank you so much for your time! Have a wonderful day!", "not_now"],
  [26, "Sep 20, 2026", "L", "Ron Liscum", "https://www.linkedin.com/in/ACoAAAyiRLkBLu-4_faIIR12KXeoFg9vhqs0VSM", "No, thanks", "not_now"],
  [27, "Oct 30, 2026", "L", "Hazem Ajlani M.Eng, PMP", "https://www.linkedin.com/in/ACoAABCTwnIBaM2TO4_dg2YbNkjPbQXqWz2gYk8", "Hello Prrithive, thanks for connecting but we're fine for now. All the best. We've got things covered. Thanks", "not_now"],
  [28, "Oct 26, 2026", "L", "Pedro Rodriguez", "https://www.linkedin.com/in/ACoAAAqOnSYBzgj8tb9pMYhqrYlq91lH5ev6S5E", "Hi Prrithive, thanks for reaching out but only buy OEM equipment is very specialized. We do all the Procurement activities in house. Best regards. We always buy from the OEM, thanks Prrithive", "not_now"],
  [29, "Oct 27, 2026", "L", "Ryan Preis", "https://www.linkedin.com/in/ACoAAAA0PsEBEGtYgSu0JR_vQ0htGwb7tciC5U0", "sure, coffee or Teams meeting sound fine.", "hot"],
  [30, "Oct 28, 2026", "L", "Pulin Chahal", "https://www.linkedin.com/in/ACoAAAgCk2gBSwm0QXAQXtro_Fv6Hi_-BV4gggg", "Hi, This is on my to do list. Could you please send me email: pulinrgcustom@sentex.net Thanks Pulin", "hot"],
  [31, "Oct 28, 2026", "L", "ASEEL KHALAF", "https://www.linkedin.com/in/ACoAABciFO4B1kbzDhhzs4yG1T4c0JGavgAQqWI", "Hi Prrithive, You might wanna reach out to the sales department at Sanofi", "cold"],
  [32, "Oct 23, 2026", "L", "Mohamad Shatila", "https://www.linkedin.com/in/ACoAAAbs-r0B-f3vFfD4Xj6LHab3cSpF_MbqpLg", "Hi Prithive, Thanks for reaching out and for sharing the details. I appreciate it. I'll definitely keep Maple MPSS in mind if a need comes up in the future. Best regards, Mohamad Shatila", "not_now"],
  [33, "Oct 26, 2026", "L", "Margaret Lai, CPA, CA", "https://www.linkedin.com/in/ACoAAAceYskBrftFMlOAywOns1qLdpdAzEB-bSY", "Hi Prithhive, thanks for sharing! Sounds like there could be some interesting opportunities for collaboration. Let me look into your question about our eCommerce clients and get back to you. Appreciate you keeping us in mind for any fractional CFO opportunities as well!", "hot"],
  [34, "Oct 25, 2026", "L", "Julia Irwin", "https://www.linkedin.com/in/ACoAAAKeSUwBc2035Ni0R3GeLoIxsnr6OW2bWg8", "Hi Preithive, Thank you for reaching out and for your interest in working with us. At this time, I don't believe we would be the right fit for your services. We are a smaller company that specializes in custom, made-to-order projects. Every project we take on is unique, with its own specific requirements, so we don't manufacture the same parts on a repetitive or high-volume basis. We also make a conscious effort to support our local Canadian manufacturers and suppliers whenever possible. We appreciate you taking the time to contact us and wish you continued success. Best regards, Julia", "not_now"],
  [35, "Oct 23, 2026", "L", "denis laframboise", "https://www.linkedin.com/in/ACoAAEOX_9MBX-sGfYmMMYbQbwdvDtjaku0Io30", "Thanks. All are working our customer supply parts and it's bid and spec. Thanks", "not_now"],
  [36, "Oct 23, 2026", "L", "Amanda Qiao", "https://www.linkedin.com/in/ACoAAAaAjVsBbDHSYn3xQSOftMJNKDjI70VnvRU", "Thanks for reaching out. We are good for now.", "not_now"],
  [37, "Oct 26, 2026", "L", "Brandon Procter", "https://www.linkedin.com/in/ACoAAAk9j4kBaL21OgfiYOQ3KmTZScUbX39nP7A", "Could you please stop.", "not_now"],
  [38, "Oct 26, 2026", "L", "Hasani Miller, P.Eng., MEng", "https://www.linkedin.com/in/ACoAABvNYr4B9Alx0Z1K1z-_n_zE6RxROe-TtXM", "Hi Prrithive, Unfortunately we have an internal team that handles drawings and reviews. However now that I have your contact, I will keep you in mind for new projects if help is needed.", "not_now"],
  [39, "Sep 30, 2026", "L", "SISNAKHAN A", "https://www.linkedin.com/in/ACoAACEHnA4B6kDvp-5PZ7u2ay00ImQnGBbiM-I", "ok i will let you know", "cold"],
  [40, "Oct 23, 2026", "L", "Geoff Furlong, P.Eng, MBA", "https://www.linkedin.com/in/ACoAAAxTVyEBPTKwGMuGC_1pwRqNv8he20Lh51Y", "No, thanks. Not at this time", "not_now"],
  [41, "Oct 23, 2026", "L", "Roy Bekic", "https://www.linkedin.com/in/ACoAAATY6o4BJ88tZMigrJpj6-Gki0fEquPBoJE", "Hi Prrithive I will keep this in mind. Have a nice weekend", "cold"],
  [42, "Nov 5, 2026", "L", "Abraham Darsi", "https://www.linkedin.com/in/ACoAAAzNL6kBqceGzlMrwRzkgktmzo-6UhHCTHE", "Hey Prrithive, thanks for reaching out. I am interested in having a quick chat. How about the week of November 16th - 20th? Thanks Abraham | Nov 16: Done! (meeting booked for Fri Nov 20, 8:00 AM EST)", "hot"],
  [43, "Nov 4, 2026", "L", "Louis Pallay", "https://www.linkedin.com/in/ACoAAABpTjEBKa1WxnxnGy-uRJuwSKiQaGM9iPI", "Thanks for reaching out. 500 of the products my machines produce, is quite a different matter compared to 500 parts fo me to build 500 machines. Anyway, sorry if I misunderstood. I do not have anything for you. Good Luck.", "not_now"],
  [44, "Nov 4, 2026", "L", "Jeff Sterling", "https://www.linkedin.com/in/ACoAAAi0z9AB7KqANBJzPwADgu-Q1yNmxCgjHfs", "No thank you. Not interested at this time.", "not_now"],
  [45, "Nov 4, 2026", "L", "Tabrez Kassam", "https://www.linkedin.com/in/ACoAAAa6afYB_XxS4kkp6y6dV7-77Vuerw2rr9Y", "Hi Prrithive. Thanks for reaching out to me. I am Interested to learn about your business. And what service you provide. | Nov 9: I have a machine shop and am looking to become a supplier for manufactured parts. Do you have any clients that require casted and machined parts", "hot"],
  [46, "Nov 3, 2026", "L", "Samir Costa", "https://www.linkedin.com/in/ACoAACMxU7sBwEXCDDqRl7-yixOzlk9XZYP-_CA", "Hi Prrithive Send your company presentation to Samir.costa@camfil.com But, for now we have no plan Thanks", "cold"],
  [47, "Nov 3, 2026", "L", "Fahad Hassan", "https://www.linkedin.com/in/ACoAABdsyAMBXyP-CXqmbPajXFw5D8MZN654WLk", "Prrithive Thank you for reaching out. Great broucher and presentation. Unfortunately, we do not need such services. Best wishes! It's not your services. We either do not have such needs or we have in-house expertise.", "not_now"],
  [48, "Oct 13, 2026", "L", "Alexander Pirie", "https://www.linkedin.com/in/ACoAAC-kRAMBMAsgG6NEL62yzRRaDIX-KtpTGig", "Thanks for reaching out! Sounds interesting, can you send me an overview of your company?", "hot"],
  [49, "Sep 28, 2026", "L", "Abhi Raval", "https://www.linkedin.com/in/ACoAACFpF0wBJH3LcrkS-cGdvt_Bzrg9bJueyus", "Hi, Prrithive. Are you a manufacturer?", "cold"],
  [50, "Sep 28, 2026", "L", "Ed Bailey", "https://www.linkedin.com/in/ACoAABN60oIBlFgBl4uIzUz2bq8bnq1Q-_T4zrg", "Thanks", "cold"],
  [51, "Nov 12, 2026", "L", "Waheed Mohammed, P.Eng", "https://www.linkedin.com/in/ACoAAGTj6g4BUE9xagHFa4vH1pyMBU86-n6Ztcw", "Are you able to review designs and provide a full calculations packages with an engineer stamp? To be used for permitting purpose?", "hot"],
  [52, "Nov 13, 2026", "L", "Tim Brown", "https://www.linkedin.com/in/ACoAAA6DuIYBf0tY0UWcfHf2lZ_6NKNGzxxJE-s", "Hi Prrithive, We are definitely looking for more canadian parts suppliers. Send me an email and I will connect you with Thomas our supply chain manager. Tim_brown@bizlinktech.com", "hot"],
  [53, "Nov 12, 2026", "S", "Tracy Scott, MBA", "https://www.linkedin.com/in/ACoAAAsYMq8B66ZTan7bfA8UsMCcWcu5b8mZ5nI", "Hi Prrithive, not right now thank you. Perhaps when I find my new home. Thanks", "not_now"],
  [54, "Nov 13, 2026", "L", "Neelesh Gajjar", "https://www.linkedin.com/in/ACoAAEO-pqQBOyU-sAEsycrcDWU8EXY2klB4c1s", "Hi, Prrithive. Hope you're doing well and thanks for reaching put I will pass this information to my sales team and if they will be in any need they will surely reach you out. Thanks", "cold"],
  [55, "Nov 13, 2026", "L", "Shiv Barot", "https://www.linkedin.com/in/ACoAAB-LD2ABrJL6qL5YKfRQ74rgSIuF_5q34Ug", "No, thanks", "not_now"],
  [56, "Nov 13, 2026", "L", "JASON NELLES", "https://www.linkedin.com/in/ACoAAB8v9UsBngItjDtS2v1r1yBYWxRkaHlFKwc", "Thanks for reaching out, and for watching the motor video. We're well covered on that side right now, so I'll pass on a call, but all the best. | Nov 16: Thanks Prrithive. We're well covered on both for now, but I'll keep you in mind.", "not_now"],
  [57, "Nov 16, 2026", "L", "SWAMI NAIR", "https://www.linkedin.com/in/ACoAADVHBbUBOwhhnu_2AFQwytHS7L89yN3ogtU", "Thanks. Could you please send me your company profile including capabilities, so that I can forward it to the purchase team for review? E mail. snair@slacan.com", "hot"],
  [58, "Nov 16, 2026", "L", "Ed Hunt, R.I.B. (Ont)", "https://www.linkedin.com/in/ACoAAB8lziMBYe97kNfc8-daeBrDFRS11MOrn10", "I appreciate you reaching out but I am going to pass for now sir thanks Ed", "not_now"],
  [59, "Nov 17, 2026", "L", "Kinjalkumar Patel, E.Eng", "https://www.linkedin.com/in/ACoAACbQzSYBejW1jOnUpOL0h7jPm62NA4sgN7E", "Hi Prrithive, Thank you for reaching out. I'm glad to connect with you and learn more about Maple MPSS and the services you provide. I would be open to either a virtual coffee chat or an in-person meeting. I am located in Tillsonburg, Ontario, near London, so whichever option works best for you is fine with me. Please let me know your preferred date and time, and I will do my best to schedule accordingly. I look forward to speaking with you. Best regards, Kinjal Patel", "hot"],
  [60, "Nov 18, 2026", "L", "Miassar Attar", "https://www.linkedin.com/in/ACoAAALdQUsBzY_2pgEjfOj0bmrLCNa7Z6SlCzM", "Thank you for connecting- i forwarded your message to our engineering manager.", "cold"],
  [61, "Nov 18, 2026", "L", "Darren Telepanich", "https://www.linkedin.com/in/ACoAAAaNWWEBjunY-7VcplIhaaXojZuuoouCjZA", "Hey Prrithive, Interesting, you guys manufacture precision parts?", "cold"],
];

// The sheet has no time of day, so replies are placed at 12:00 noon Toronto time on their date.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function noonToronto(dateText: string): Date {
  const m = /^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})$/.exec(dateText)!;
  const y = Number(m[3]), mo = MONTHS.indexOf(m[1].toLowerCase()), d = Number(m[2]);
  for (const off of [4, 5]) {
    const c = new Date(Date.UTC(y, mo, d, 12 + off));
    const h = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hour12: false }).format(c);
    if (Number(h) === 12) return c;
  }
  return new Date(Date.UTC(y, mo, d, 17));
}

const slugOf = (url: string) => /\/in\/([^/?#]+)/.exec(url)![1];
const SENTIMENT = { hot: "positive", cold: "neutral", not_now: "neutral" } as const;
const REASON: Record<Cat, string> = {
  hot: "Marked Hot in your responses sheet.",
  cold: "Marked Cold in your responses sheet.",
  not_now: "Marked \"not at this time\" in your responses sheet.",
};

const dry = process.argv.includes("--dry");
const b = dry ? await openMemoryDb() : getBundle();
let created = 0, existing = 0, added = 0, skipped = 0;

for (const [n, dateText, platform, name, rawUrl, response, cat] of ROWS) {
  const slug = slugOf(rawUrl);
  const url = rawUrl.split("?")[0];
  const sentAt = noonToronto(dateText);

  const prior = (await b.db.select().from(prospects).where(eq(prospects.providerUserId, slug)).limit(1))[0];
  const conv = prior ? (await b.db.select().from(conversations).where(eq(conversations.prospectId, prior.id)).limit(1))[0] : null;

  const r = (await ingestEvent(b, {
    source: "csv",
    eventType: "message.new",
    externalMessageId: `sheet-${n}`,
    externalThreadId: conv?.externalThreadId ?? `sheet:${slug}`,
    inbox: platform === "S" ? "sales_navigator" : conv?.inbox ?? "classic",
    direction: "inbound",
    text: response.trim(),
    sentAt,
    sender: { providerUserId: slug, fullName: name, linkedinUrl: url, headline: null },
  }));
  if (r.status !== "processed") { skipped++; continue; }
  if (r.createdProspect) created++;
  else existing++;
  added++;

  const id = r.prospectId;
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, id)).limit(1))[0];
  const inboundCount = (await b.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.prospectId, id), eq(messages.direction, "inbound"))).limit(1))[0].c;

  // Your category wins over keyword rules; record it as the intent so the AI card explains it.
  (await b.db.insert(aiInsights).values({
    prospectId: id, kind: "intent", engine: "sheet", promptVersion: "sheet-v1", inputMessageId: r.messageId,
    output: { category: cat, confidence: 1, sentiment: SENTIMENT[cat], reason: REASON[cat], evidence_quote: response.trim().split(/\n/)[0].slice(0, 160), follow_up_date: null, stop_contact: false },
  }));
  (await b.db.update(prospects).set({
    category: cat,
    categorySource: "manual",
    sentiment: SENTIMENT[cat],
    leadScore: leadScore({ category: cat, designation: p.designation, lastInboundAt: p.lastInboundAt, inboundCount }, undefined, sentAt),
    ...(cat === "not_now" ? { nextFollowUpAt: new Date(sentAt.getTime() + 90 * 86_400_000) } : {}),
  }).where(eq(prospects.id, id)));
  (await b.db.insert(activities).values({ prospectId: id, actor: "user", action: "Category set from responses sheet", details: { category: cat, row: n }, dedupeKey: `sheet-cat:${n}`, occurredAt: sentAt }).onConflictDoNothing());

  (await summarizeProspect(b, id));
  (await nextActionForProspect(b, id));

  // The sheet owner asked to stop: honour it.
  if (name === "Brandon Procter") {
    (await b.db.update(prospects).set({ doNotContact: true, nextFollowUpAt: null }).where(eq(prospects.id, id)));
    (await b.db.insert(activities).values({ prospectId: id, actor: "system", action: "Stop Contact Requested", details: { evidence: response.trim() }, dedupeKey: `stop:sheet-${n}`, occurredAt: sentAt }).onConflictDoNothing());
  } else {
    (await draftReplyForProspect(b, id));
  }
}

// Historical data: no "new reply" alerts, and no queued AI jobs that would overwrite your categories.
const ids = (await b.db.select({ id: prospects.id }).from(prospects)).map((x) => x.id);
(await b.db.update(alerts).set({ readAt: new Date() }).where(and(sql`${alerts.readAt} is null`, eq(alerts.type, "new_reply"), inArray(alerts.prospectId, ids))));
(await b.db.update(jobs).set({ status: "done" }).where(and(eq(jobs.status, "pending"), inArray(jobs.type, ["classify_intent", "summarize_conversation", "next_best_action", "draft_reply"]))));

const total = (await b.db.select({ c: sql<number>`count(*)` }).from(prospects).limit(1))[0].c;
console.log(`${dry ? "[DRY RUN] " : ""}rows: ${ROWS.length}, imported: ${added} (new prospects ${created}, existing ${existing}), skipped/already there: ${skipped}, prospects in DB: ${total}`);
