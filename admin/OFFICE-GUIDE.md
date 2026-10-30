# Office guide: the website editor

This guide is for the BC Glass & Tint office. You change the website in the content editor (the
admin page of the site). You never touch code. Every time you press Save, the change is sent to the
site and the site rebuilds itself. Give it a few minutes, then look at the page.

Only one person should edit at a time. Save one change, look at the page, then do the next one.

## What you can change, and what you cannot

You can change:

- **Business Info & Review Counts**: the hours, the holiday closures, the days with hours not
  confirmed, the two owner switches (texts and chip photos), the review counts, the phone number,
  the address and the social links.
- **Prices & Gallery Photos**: every price, and the photos in the gallery.
- **Customer Reviews**: which real reviews the site is allowed to quote.
- **Shared Wording, Homepage, Service Pages, Town Pages, Other Pages**: the words on the pages.

You cannot change, and should not look for:

- The tracking codes (visitor counting, ads, the Google ownership check). They are kept where only
  the studio can reach them.
- The page layout files. They are not in the editor at all.
- Any line marked **Technical**, **studio only** or **Ask the studio before changing**. If you see
  one, leave it alone and ask the studio.
- The legal hold on full windshield film. It is locked on purpose and the editor has no switch for it.

## A bad entry is stopped, not published

The editor checks what you type when you press Save. If a box is empty that must be filled, or a
value is in the wrong shape, the editor shows a red message under that box and does not save. Fix the
box and press Save again. Nothing reaches the site until the box is right.

- **Phone number.** The dialing form must be a plus sign, the 1, then ten digits with no spaces,
  dashes or brackets, for example `+17025508840`. The other three forms of the number have their own
  shapes, shown under each box. A phone number in the wrong shape cannot be saved. That is on
  purpose: one wrong digit would send every call button on every page to the wrong number.
- **Dates** must be picked with the date picker, so they are real days.
- **Hours** must be written in 24-hour time, for example `09:00` and `17:00`.

The site builder checks the phone number, the hours and the dates again when it builds. If a bad value
ever got past the editor, the build stops and the site that is already live stays as it was. If a
save is followed by a build that does not finish, do not keep editing. Write down what you changed
and tell the studio.

## Holiday closures and days with hours not confirmed

Open **Business Info & Review Counts** and scroll to the hours.

**Holiday closures (shop closed all day)** is the list of days the shop is closed. For each one:

1. Click **Add Closed day**.
2. Pick the **Date** with the date picker.
3. Type the **Reason** as a short name. The site prints it: "Closed for Thanksgiving." So write
   Thanksgiving, Christmas Eve, or the day after Christmas.
4. Press Save.

Add a day here only after the owner has said the shop is closed that day. On that date the site says
the shop is closed and shows the next day it opens. A closure with no date or no reason cannot be
saved. Old dates can stay; the site ignores days that have passed.

**Holidays with hours not confirmed** is the list of days nobody has decided yet. On those dates the
site shows no open or closed message at all, so it never says something wrong. When the owner decides
a day:

- Closed all day: add it to Holiday closures, and delete it from the not confirmed list.
- Open normal hours: just delete it from the not confirmed list.

A date can be in one list or the other, never both. The build stops if the same date is in both.

## The two owner switches

Both are in **Business Info & Review Counts**. Leave each one **off** until the owner has said yes.

- **The shop answers texts.** While it is off, the site offers **Request a time** as the main
  button when the shop is closed. When you turn it on, the site offers **Text us** instead. Turn it
  on only when texts really are read and answered.
- **The shop can assess a chip from a photo.** Turn it on only when the owner has said the shop can
  look at a photo and say whether the chip can be repaired.

Under **Lines the site shows once the owner confirms them** are three short sentences (how fast
texts are answered, how fast a request gets confirmed, how long a call takes). Leave each one empty
until the owner has confirmed exactly what the shop does. An empty line is not shown.

## The one rule about prices

A price shows on the live site only when two things are true:

1. **Status** is **Confirmed**, and
2. **Show on the live site** is switched **on**.

Anything else shows "Call for a quote". A Draft price never shows to customers, even if you type a
number in it. Confirmed means the owner gave you that exact number. Only a confirmed price may be
switched on.

### How to change a price and switch it on

1. Open **Prices & Gallery Photos**, then **Prices**.
2. Find the line you want. Single lines (chip repair, home film, coatings, blinds) are under
   **Single-price lines**. Car, SUV, pickup and van tint prices are under **Auto tint prices**. Click
   a line to open it.
3. Set **Status** to **Confirmed**.
4. Type the **Amount** as a plain number with no dollar sign, for example `80`.
5. Type **Words the site prints** exactly as customers should read it, for example `$80` or `From $350`.
6. Type **Confirmed by** (who gave you the number, by role) and pick **Confirmed on** (the day they
   gave it).
7. Switch **Show on the live site** on.
8. Change **Date last updated** at the top to today's date (year-month-day, for example `2026-11-02`),
   then press Save.

To take a price down, switch **Show on the live site** off, or set Status back to Draft or Unknown.
The site goes back to "Call for a quote" for that line.

If you do not know a price yet, set Status to **Unknown** and leave Amount and Words the site prints
empty. Never type 0 to mean unknown.

Full windshield film is on a legal hold. It has no price switch in the editor and the site never
prints a price for it. Leave it alone.

## Customer reviews

Open **Customer Reviews**. The site quotes a review only when it is a **Google** review and **Site
may quote this review** is on. Yelp wording never goes on the site, so the Yelp entries keep an empty
review text on purpose.

- Turn **Site may quote this review** on only for a Google review that someone re-read on the live
  Google listing. Pick the day under **Date it was re-read on the live listing**.
- A **Problem flag** is a warning for people. The site does not read it, so the switch is the only
  control. Never turn the switch on for a flagged review, and do not remove a flag unless the studio
  agrees.
- When you add a review, copy the words exactly as they are on the listing. Never retype, shorten,
  join or invent one.

## How to add a gallery photo

Add only photos that are ready: no faces, no personal items, and the customer is OK with it.

1. Open **Prices & Gallery Photos**, then **Gallery Photos**.
2. Click **Add Photo** under Photos.
3. Fill in **Photo id**: a short name with dashes and no spaces, such as `ford-f-150-side`.
   It must be different from every other photo.
4. Pick the **Service**.
5. For a vehicle photo, fill in **Make**, **Model** and **Body**. Only write a model you are sure of
   from the job record. Leave Model empty if you are not sure. For a home, office or chip repair photo,
   leave the vehicle fields empty.
6. Pick every window that has film in the photo under **Windows with film in this photo**.
7. **Shade**: type the shade from the job record, the percent of light let through. If the job
   record does not say, leave it empty. Never guess the shade from the photo.
8. Type a **Title** and a one sentence **Photo description** of what the photo shows. Do not use the
   customer's name.
9. Upload the **Small photo (640 wide)** and the **Large photo (1280 wide)**.
10. Ask the studio to fill in the width and height boxes if you are not sure of them.
11. Switch **Checked** on only when all three are true: no faces, no personal items, and the
    customer is OK with it.
12. Change **Date last updated**, then press Save.

To take a photo off the site, delete it from the list or ask the studio to do it.

## What never to do

- **Never publish a price that has not been signed off by the owner.** No Confirmed without the
  owner's exact number. No guesses, no competitor numbers, no 0.
- **Never turn on a holiday closure, a text switch or a chip photo switch the owner has not said yes
  to.**
- **Never guess a shade.** If the job record does not say, leave Shade empty.
- **Never add a photo with a face, a license plate you are unsure about, a personal item, or a
  customer who has not said yes.** If in doubt, leave it out.
- **Never type a dollar amount into a sentence on any page.** Prices come only from the Prices list,
  so they follow the rule above.
- **Never turn on Site may quote this review for a Yelp review or for a review nobody re-read on
  Google.**
- **Never change lines marked "Technical", "studio only" or "Ask the studio before changing".**
- **Never write that the shop does windshield replacement labor.** Replacement is done by a partner
  shop. Chip repair is done here.

## When something looks wrong

Do not try to fix it by editing more fields. Write down the page and what you saw, and tell the
studio.
