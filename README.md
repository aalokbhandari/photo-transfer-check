# photo transfer check

You copied your photos off your phone and you're about to delete them from the phone to free up space. Check them first.

**Use it here:** https://aalokbhandari.github.io/photo-transfer-check/

Pick the folder you copied to, and it tells you straight away whether it's safe to delete from your phone. Everything runs in your browser and nothing gets uploaded.

## why I made this

I copied about 3,700 photos and videos from my iPhone to my Windows laptop over USB, looked at a few previews, and cleared my phone. Months later I found out that 860 of them had been cut short during the copy, and 203 more had the wrong extension (a JPEG saved as `.MOV`, that kind of thing). The previews looked fine because phones store a small thumbnail separately from the full picture.

The full story and how I recovered what I could: [write-up](https://www.aalokbhandari.com.np/writing/iphone-photos-broken-after-copying-to-windows) and [recovery scripts](https://github.com/aalokbhandari/laptop-recovery-report).

## what it checks

For each photo or video:

- **what it really is**, from the first few bytes (JPEG, HEIC, PNG, MOV, MP4, WebP, GIF, DNG/TIFF), not from the name
- **whether it's whole.** HEIC, MOV and MP4 files are made of boxes that each say how long they are. If a box needs more bytes than the file has, the copy stopped early. Videos also need their `moov` index or nothing can play them. JPEGs and PNGs have to end with their end marker.

Then you get one of two answers:

- **safe to delete from your phone**, if every file came over whole
- **don't delete yet**, with the list of files to copy again

Files that are whole but have the wrong extension get a little Windows script that renames them. Put it in the folder you picked and double-click it. You can also download the full result as a CSV.

## to avoid the problem in the first place (iPhone)

Settings → Photos → Transfer to Mac or PC → **Keep Originals**. Copy a few hundred at a time, keep the phone unlocked, then run the check.

## running it yourself

It's three files (`index.html`, `app.js`, `check.js`) with no build step and no dependencies. Serve the folder with any static server, e.g. `python -m http.server`, and open it. Tests: `npm test` (Node 18+).

`check.js` doesn't care where the bytes come from, so you can use it from Node too. `checkFile(name, size, read)` takes a function that reads bytes at an offset.

## limits

- It checks structure, not every pixel. A file can be whole and still have damaged bits inside. That's rare and this won't catch it.
- A HEIC that's only missing its last tile still opens, mostly fine. This will still call it cut short, because it isn't a complete copy and you shouldn't delete the original yet.
- Folder picking works in Chrome, Edge and Firefox on a computer. Phones can use "choose files".

## thanks

Umang Gupta and Prabesh Sharma, for testing and reviewing.

MIT license · Aalok Bhandari
