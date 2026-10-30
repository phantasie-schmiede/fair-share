# Fair Share – Fair ingredient assignment for your kindergarten

[English](README.md) | [Deutsch](README.de.md)

A small web app for special meal days in the kindergarten group:
it fairly decides **which child brings which ingredient** – costs
count more than frequency, and the time in the kindergarten is taken
into account.

Just open `index.html` and start – **no installation, no server,
works offline**. Runs on a Windows laptop as well as on tablets and
phones (responsive layout).

## Getting started

1. Double-click `index.html` (or open it with right-click in
   Firefox/Edge/Chrome).
2. Set up your group under **Kids** – a name and an enrollment date
   are needed.
3. Under **Price list** check the ingredients and adjust the prices
   to your local supermarket (a realistic default list is already
   there).
4. Plan the meal under **Plan event**: date, optional name,
   ingredients. The assignment is **shown live**, before the event
   is even saved.

## Planning and price list

- The price list is grouped by category (categories and the
  ingredients within a category are sorted alphabetically).
  Categories are first-class entries: they can be added, renamed and
  deleted - when deleting, you choose whether the ingredients of the
  category are deleted as well or only lose their assignment. Saved
  events keep their ingredients in both cases (history is never lost).
- Names are unique: a child, an ingredient or a category can not be
  created or renamed to a name that already exists
  (case-insensitive).
- When you plan an event, a matching ingredient pre-fills its unit
  (read-only, next to the quantity), its default quantity and its
  default price.
- The price follows the quantity by factor:
  `price = default price × quantity ÷ default quantity`
  (e.g. 500 g for EUR 1.49 → 1000 g = EUR 2.98). A manually typed
  price wins over the factor from then on.
- Past events can be **cloned** (History → "Clone"): the ingredient
  list becomes the starting point of a new plan and can be edited
  like any other draft.
- **Future events** (dated today or later) can be **edited**
  (History → "Edit": date, title and ingredients in the planning
  view) and **deleted** (History → "Delete", with confirmation).
  Past events are final: their history can not be changed anymore.
- Kids can be **renamed** any time: their assignments survive the
  rename (internally, a child is identified by an id, not by name).
- The **Enter key** is a shortcut: it saves a completed
  operation (e.g. the Kita name in History → Data & backup), and
  when a required field is still empty it moves the focus to that
  field. When planning an event it walks date → title →
  ingredient rows and opens a new row after a completed one.

## How the fairness works

- The **group rate** (EUR per week) is calculated from all
  spending so far.
- Each child's **target** = group rate × time in the kindergarten
  (weeks since the enrollment date).
- The **difference** = paid so far − target. The child furthest
  *below* their target gets the most expensive ingredient first –
  and so on.
- **New children do not need to catch up:** their target starts
  small (from the enrollment date), and they join the rotation at
  the normal pace from the next event.
- In principle each child brings **at most one ingredient** per
  event. If there are more ingredients than children, the limit
  lifts (round two) so that every ingredient finds a child.
- With an equal difference: the child with **fewer previous
  assignments** goes first. With an exactly equal standing a
  deterministic random value (the seed is stored per event)
  decides – same inputs always give the same result, so equally
  strong families rotate instead of one always going first.

The **Overview** shows at a glance who is next, what each family
has paid so far and how balanced the group currently is.

## Where is the data stored?

- **Edge / Chrome:** via the info banner you can link a
  JSON file (e.g. `kita-data.json` in your Documents folder).
  Every change is saved there automatically; after restarting the
  laptop, one click on "Reconnect file" is enough.
- **Firefox / Safari:** the data lives in browser storage
  (IndexedDB). In both modes the browser always keeps an additional
  safety copy.
- **Backup / moving:** under **History** → "Share data" (shares the
  file through the operating system, e.g. by e-mail) or "Export
  data (JSON)". To restore, use "Import data" – importing replaces
  all current data.
- **Print/CSV:** also under **History** – the complete history as
  CSV (semicolon-separated, UTF-8, ready to use in
  Excel/LibreOffice) or as a printout. Tick the checkboxes in front
  of individual events to export or print only a selection – the
  button labels switch to "Selection …"; nothing ticked means
  everything. (JSON export and sharing always cover the complete
  data.)
- **Poster print ("Aushang"):** a second print button under
  **History** for wall posters: ingredient, combined quantity and
  unit (e.g. "500 g") and child – without prices, one event per
  page. It honours the selection as well.
- **Several tabs / browsers:** do not edit the data in two tabs
  or browsers at the same time. When you do, every save re-reads
  the stored data first: when it finds a newer version than the
  working copy, it asks whether to overwrite (your changes win) or
  to load the saved version – a silent overwrite never happens.
- **Saving to the file failed:** if the linked file cannot be
  written (e.g. it is read-only or storage is full), the app
  shows a banner: your changes keep being saved reliably in the
  browser, but the file contains an older copy. The banner stays
  visible until writing to the file succeeds again.

All data stays on the device. No internet connection, no cloud, no
forwarding.

## Encryption (passphrase)

- Under **History → Data & backup** you can encrypt the whole data
  set behind a passphrase: "Encrypt data" (passphrase + repeat, at
  least 8 characters). From then on, every save writes an encrypted
  file (AES-GCM, key derived via PBKDF2 with 210 000 iterations)
  instead of plain JSON – in both storage modes (file and browser
  storage). The header indicator shows a lock while encryption is
  active.
- The next start (or the next device) asks for the passphrase
  before anything is shown. "Change passphrase" re-encrypts the
  data; "Remove encryption" stores it as plain JSON again.
- **The passphrase is never stored** – not in the app, not in the
  browser, not in the data file. It is only derived into a key in
  memory for the current session. **If the passphrase is forgotten,
  the data is lost – there is no recovery.** A wrong passphrase and
  a corrupted file produce the same (honest) error message.
- **Encrypted import:** importing a file that is an encrypted
  envelope (e.g. one created on another device) asks for the
  passphrase of THAT file before importing – same prompt, retry on
  a wrong passphrase, "Cancel" returns to the app. The file's
  passphrase is only used to read the file: it does not enable or
  change the app's own encryption.
- **Encrypted export:** while encryption is active, "Export data
  (JSON)" and "Share data" produce an encrypted envelope (the same
  format as the regular safety copies) instead of plain text – the
  import detects it automatically and asks for the file's
  passphrase. Without encryption both keep exporting plain JSON.
- **What the passphrase protects:** the encryption protects the
  *stored* data – for example a stolen data file or a lost USB
  stick. A running, unlocked browser tab can of course still see
  the data; a compromised device is not protected by it. Outside
  the encrypted area only the revision number `rev` stays
  visible: it serves the conflict detection (see "Several tabs /
  browsers") and reveals nothing about the content.

## Audit log and data retention

- Every action of the app is recorded with its timestamp: adding,
  activating, deactivating or removing kids, ingredients and
  categories, saving or correcting events, imports and language
  changes. The log is shown newest first in the **Log** tab.
- The log can be exported as **CSV** (human readable) or **JSON**
  (machine readable). It can not be deleted from the app.
- A **five-year retention cap** applies automatically: events, log
  entries and *deactivated* kids older than five years are removed
  (a removed kid's assignments leave the events with them; events
  without ingredients disappear as well). *Active* kids are never
  removed. Deactivated kids show their deletion date (five years
  after the enrollment date) in the kids view.

## Data protection

- **What is stored:** only first names, enrollment dates and cost
  data – no last names, addresses, phone numbers or birth dates.
  Please keep it that way.
- **Where it is stored:** only on the device the app is opened on
  (linked data file or browser storage). No internet connection, no
  cloud, no third-party processor – the kindergarten itself is the
  only controller of the data.
- **Access:** lock the laptop when it is not in use. In browser
  storage mode use a separate browser profile per person (the data
  is isolated per profile); in file mode use one data file per
  person.
- **Backups:** export a backup regularly (JSON); keep backups on
  encrypted storage (Windows BitLocker / macOS FileVault).
- **Deleting everything:** remove the data file and delete the
  app's browser storage (the IndexedDB database "fair-share").
- Optional: when the device may be accessed by other people,
  passphrase-based encryption of the data can be added in a later
  version.

## Language

German is the default language. The button in the header shows the
other language and switches the whole app (including the menu) to
it; the choice is saved.

## For developers

The app runs completely offline from `file://` – hence classic
scripts under the `window.FairShare` namespace (ES modules are
blocked by the browser on `file://`). Bootstrap 5.3.8 is vendored
in `vendor/bootstrap/`.

```
index.html           entry point
styles.css           small override layer on top of Bootstrap
vendor/bootstrap/    Bootstrap 5.3.8 (offline)
js/util.js           small helpers (dates, ids, HTML escaping, price scaling)
js/defaults.js       default price list (localized)
js/i18n.js           I18n class (translation + formats)
i18n/de.js, en.js    language catalogs
js/model.js          DataModel (data storage, mutations, audit log)
js/fairness.js       Fairness class (assignment, purely static)
js/storage.js        StorageManager (file mode + browser mode)
js/exporters.js      Exporter (JSON, share, CSV, log export)
js/views/*.js        the six views
js/app.js            App class (glue, saving, import)
tests/               unit tests (node --test)
```

Tests (only needed for development – the app itself runs without
Node.js, only Node ≥ 18 is required):

```
node --test
```

### Data format (JSON, version 1)

```json
{
  "version": 1,
  "metadata": {
    "createdAt": "2025-09-01",
    "kindergartenName": "",
    "updatedAt": ""
  },
  "kids": [
    { "id": "k_a1b2c3", "name": "Lotte", "enrolledOn": "2025-09-01", "active": true }
  ],
  "events": [
    {
      "id": "e_d4e5f6",
      "date": "2026-09-01",
      "title": "Italian Day",
      "seed": 123456,
      "ingredients": [
        {
          "name": "Tomatoes",
          "quantity": 500,
          "unit": "g",
          "price": 1.49,
          "childId": "k_a1b2c3",
          "manual": false
        }
      ]
    }
  ],
  "log": [
    {
      "t": "2026-09-01T09:00:00.000Z",
      "action": "event.save",
      "data": { "title": "Italian Day", "date": "2026-09-01", "count": 1, "total": 1.49 }
    }
  ],
  "priceList": [
    {
      "name": "Tomatoes",
      "quantity": 500,
      "unit": "g",
      "category": "Vegetables",
      "price": 1.49
    }
  ],
  "settings": { "language": "de", "maxIngredientsPerChild": 1 }
}
```

Manually corrected assignments/prices are marked with
`"manual": true`; the history displays them as "manually
adjusted". `metadata.kindergartenName` holds the optional
name of the Kita; when set, it is shown in the header
instead of the generic tagline. It can be edited under
History → Data & Backup; an empty field clears the name
again.

## License

This project is licensed under the GNU General Public License,
version 3 or (at your option) any later version – the full text
is in the [LICENSE](LICENSE) file.
