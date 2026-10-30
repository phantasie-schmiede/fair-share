# Fair Share – Faire Zutaten-Zuteilung für die Kita

[English](README.md) | [Deutsch](README.de.md)

Eine kleine Web-App für besondere Essens-Tage in der Kita-Gruppe:
Sie legt fair fest, **welches Kind welche Zutat mitbringt** – die
Kosten zählen mehr als die Häufigkeit, und die Zeit in der Kita wird
berücksichtigt.

Einfach `index.html` öffnen und loslegen – **keine Installation, kein
Server, funktioniert offline**. Läuft am Windows-Laptop sowie auf
Tablets und Smartphones (responsives Layout).

## Start

1. `index.html` doppelklicken (oder per Rechtsklick mit
   Firefox/Edge/Chrome öffnen).
2. Unter **Kinder** die Gruppe anlegen – Name und Eintrittsdatum
   werden benötigt.
3. Unter **Preisliste** die Zutaten prüfen und die Preise an den
   örtlichen Supermarkt anpassen (eine realistische Standardliste
   ist bereits vorhanden).
4. Unter **Neues Event** das Essen planen: Datum, optionaler Name,
   Zutaten. Die Zuteilung wird **lebendig mit angezeigt**, noch
   bevor das Event gespeichert wird.

## Planung und Preisliste

- Die Preisliste ist nach Kategorien gruppiert (Kategorien und die
  Zutaten innerhalb einer Kategorie alphabetisch sortiert).
  Kategorien sind vollwertige Einträge: Sie lassen sich hinzufügen,
  umbenennen und löschen – beim Löschen wird ausgewählt, ob die
  Zutaten der Kategorie ebenfalls gelöscht oder nur der Zuweisung
  entzogen werden. Gespeicherte Events behalten in beiden Fällen
  ihre Zutaten (die Historie geht nie verloren).
- Namen sind eindeutig: Ein Kind, eine Zutat oder eine Kategorie kann
  nicht mit einem bereits bestehenden Namen angelegt oder umbenannt
  werden (groß-/kleinschreibung-unabhängig).
- Bei der Event-Planung übernimmt eine passende Zutat ihre Einheit
  (read-only, neben der Menge), ihre Standardmenge und ihren
  Standardpreis.
- Der Preis passt sich der Menge per Faktor an:
  `Preis = Standardpreis × Menge ÷ Standardmenge`
  (z. B. 500 g für 1,49 € → 1000 g = 2,98 €). Manuell eingetippte
  Preise behalten ab dann Vorrang vor dem Faktor.
- Vergangene Events lassen sich **klonen** (Historie → „Klonen“):
  Die Zutatenliste wird zur Startbasis für einen neuen Plan und
  kann wie jeder andere Draft bearbeitet werden.
- **Zukünftige Events** (heute oder später) können **bearbeitet**
  (Historie → „Bearbeiten“: Datum, Titel und Zutaten in der
  Plan-Ansicht) und **gelöscht** werden (Historie → „Löschen“, mit
  Bestätigung). Vergangene Events sind final: ihre Historie kann
  nicht mehr geändert werden.
- Kinder können jederzeit **umbenannt** werden: Die Zuweisungen
  bleiben dabei erhalten (das Kind wird intern per ID, nicht nach
  Name, referenziert).
- Die **Eingabetaste** ist eine Abkürzung: Sie speichert eine
  abgeschlossene Aktion (z. B. den Kita-Namen unter Historie →
  Daten & Sicherung) und springt bei einem noch leeren
  Pflichtfeld in dieses Feld. Bei der Planung geht sie durch
  Datum → Titel → Zutatzeilen und öffnet nach einer
  abgeschlossenen Zeile automatisch eine neue.

## So funktioniert die Fairness

- Aus allen bisherigen Ausgaben wird die **Gruppenrate**
  (Euro pro Woche) berechnet.
- Das **Soll** jedes Kindes = Gruppenrate × Zeit in der Kita
  (Wochen seit dem Eintrittsdatum).
- Die **Abweichung** = bisher gezahlt − Soll. Das Kind, das am
  weitesten *unter* seinem Soll liegt, bekommt zuerst die
  teuerste Zutat – und so weiter.
- **Neue Kinder müssen nicht aufholen:** Ihr Soll startet klein
  (ab dem Eintrittsdatum), und sie kommen ab dem nächsten Event im
  normalen Takt dran.
- Grundsätzlich bringt jedes Kind pro Event **maximal eine Zutat**
  mit. Gibt es mehr Zutaten als Kinder, hebt sich die Grenze
  (Runde zwei), damit jede Zutat ein Kind findet.
- Bei gleicher Abweichung: Das Kind mit **weniger bisherigen
  Zuweisungen** hat Vorrang. Bei exakt gleichem Stand entscheidet
  ein deterministischer Zufallswert (der Seed wird pro Event
  gespeichert) – gleiche Eingaben liefern immer dasselbe Ergebnis,
  gleich starke Familien rotieren also, anstatt dass immer eine
  zuerst an der Reihe ist.

In der **Übersicht** seht ihr auf einen Blick, wer als Nächstes dran
ist, was jede Familie bisher gezahlt hat und wie ausgeglichen die
Gruppe aktuell ist.

## Wo werden die Daten gespeichert?

- **Edge / Chrome:** Über das Hinweis-Banner könnt ihr eine
  JSON-Datei verknüpfen (z. B. `kita-data.json` im Ordner
  „Dokumente“). Jede Änderung wird automatisch dort gespeichert;
  nach dem Neustart des Laptops genügt ein Klick auf „Datei
  wiederherstellen“.
- **Firefox / Safari:** Die Daten liegen im Browser-Speicher
  (IndexedDB). In beiden Modi führt der Browser immer zusätzlich
  eine Sicherheits-Kopie.
- **Backup / Umzug:** Unter **Historie** → „Daten teilen“ (teilt die
  Datei über das Betriebssystem, z. B. per E-Mail) oder „Daten
  exportieren (JSON)“. Zum Wiederherstellen „Daten importieren“
  verwenden – der Import ersetzt alle aktuellen Daten.
- **Drucken/CSV:** ebenfalls unter **Historie** – die komplette
  Historie als CSV (Semikolon-getrennt, UTF-8, direkt in
  Excel/LibreOffice nutzbar) oder als Ausdruck. Mit den Häkchen vor
  den einzelnen Events lässt sich nur eine Auswahl exportieren oder
  drucken – die Button-Labels wechseln auf „Auswahl …“; nichts
  angekreuzt = alles. (JSON-Export und Teilen betreffen immer die
  kompletten Daten.)
- **Aushang-Druck:** ein zweiter Druck-Button unter **Historie** für
  Aushänge: Zutat, kombinierte Menge und Einheit (z. B. „500 g“) und
  Kind – ohne Preise, ein Event pro Seite. Auch hier gilt die
  Auswahl.
- **Mehrere Tabs / Browser:** Bitte nicht gleichzeitig in zwei
  Tabs oder Browsern bearbeiten. Beim Speichern wird die
  gespeicherte Version jeweils zuerst neu gelesen: Findet die App
  eine neuere Version als die Arbeitskopie, fragt sie, ob
  überschrieben werden soll (eure Änderungen gewinnen) oder die
  gespeicherte Version geladen werden soll – eine stille
  Überschreibung gibt es nicht.
- **Speichern in das File fehlgeschlagen:** Kann das verknüpfte
  File nicht geschrieben werden (z. B. schreibgeschützt oder
  Speicher voll), zeigt die App ein Banner: Die Änderungen werden
  weiterhin zuverlässig im Browser gespeichert, das File enthält
  aber eine ältere Kopie. Das Banner bleibt sichtbar, bis ein
  Speichern in das File wieder klappt.

Alle Daten bleiben auf dem Gerät. Keine Internetverbindung, keine
Cloud, keine Weitergabe.

## Verschlüsselung (Passwort)

- Unter **Historie → Daten & Sicherung** lässt sich der komplette
  Datensatz mit einem Passwort verschlüsseln: „Daten
  verschlüsseln“ (Passwort + Wiederholung, mindestens 8 Zeichen).
  Ab dann schreibt jede Sicherung eine verschlüsselte Datei
  (AES-GCM, Schlüssel über PBKDF2 mit 210 000 Iterationen) statt
  Klartext-JSON – in beiden Speicher-Modi (Datei und
  Browser-Speicher). Der Zeilen-Indikator zeigt ein Schloss, solange
  die Verschlüsselung aktiv ist.
- Beim nächsten Start (oder auf einem anderen Gerät) wird vor
  dem Anzeigen der Daten nach dem Passwort gefragt. „Passwort
  ändern“ verschlüsselt die Daten neu; „Verschlüsselung aufheben“
  speichert sie wieder als Klartext-JSON.
- **Das Passwort wird nirgends gespeichert** – nicht in der App,
  nicht im Browser, nicht in der Datendatei. Es wird nur für die
  laufende Sitzung im Speicher zu einem Schlüssel abgeleitet.
  **Wer das Passwort verliert, verliert die Daten – es gibt keine
  Wiederherstellung.** Ein falsches Passwort und eine
  beschädigte Datei geben dieselbe (ehrliche) Fehlermeldung aus.
- **Verschlüsselter Import:** Wird eine Datei importiert, die ein
  verschlüsseltes Envelope ist (z. B. auf einem anderen Gerät
  erstellt), fragt die App vor dem Import nach dem Passwort DER
  Datei – derselbe Prompt, bei falschem Passwort einfach erneut
  versuchen, „Abbrechen“ kehrt zur App zurück. Das Passwort der
  Datei dient nur zum Lesen: Es aktiviert oder ändert nicht die
  eigene Verschlüsselung der App.
- **Verschlüsselter Export:** Solange die Verschlüsselung aktiv
  ist, liefern „Daten exportieren (JSON)“ und „Daten teilen“ ein
  verschlüsseltes Envelope (dasselbe Format wie die
  Sicherungsdateien) statt Klartext – der Import erkennt es
  automatisch und fragt danach das Passwort der Datei ab. Ohne
  Verschlüsselung exportieren beide weiter Klartext-JSON.
- **Was das Passwort schützt:** Die Verschlüsselung schützt die
  *gespeicherten* Daten – z. B. ein gestohlenes Datenfile oder ein
  verlorener USB-Stick. Ein laufender, entsperrter Browser-Tab
  sieht selbstverständlich weiterhin die Daten; ein
  kompromittiertes Gerät ist damit nicht geschützt. Außerhalb des
  verschlüsselten Bereichs bleibt nur die Revisionsnummer `rev`
  sichtbar: Sie dient der Konflikterkennung (siehe „Mehrere Tabs /
  Browser“) und verrät nichts über den Inhalt.

## Protokoll und Aufbewahrung

- Jede Aktion der App wird mit Zeitstempel aufgezeichnet: Kinder,
  Zutaten und Kategorien hinzufügen, aktivieren, deaktivieren oder
  entfernen, Events speichern oder korrigieren, Imports und
  Sprachwechsel. Das Protokoll wird im Reiter **Protokoll**
  angezeigt (neueste Einträge oben).
- Das Protokoll lässt sich als **CSV** (lesbar) oder **JSON**
  (maschinenlesbar) exportieren. Es kann in der App nicht gelöscht
  werden.
- Eine **5-Jahre-Aufbewahrungsgrenze** wirkt automatisch: Events,
  Protokolleinträge und *inaktive* Kinder, die älter als fünf Jahre
  sind, werden entfernt (die Zuweisungen eines entfernten Kindes
  verlassen die Events mit ihm; Events ohne Zutaten verschwinden
  ebenfalls). *Aktive* Kinder werden nie entfernt. Inaktive Kinder
  zeigen ihr Löschdatum (fünf Jahre nach dem Eintrittsdatum) im
  Kinder-Reiter an.

## Datenschutz

- **Was gespeichert wird:** nur Vornamen, Eintrittsdaten und
  Kosten-Daten – keine Nachnamen, Adressen, Telefonnummern oder
  Geburtsdaten. Bitte so beibehalten.
- **Wo gespeichert:** nur auf dem Gerät, auf dem die App geöffnet
  wird (verknüpfte Datenfile oder Browser-Speicher). Keine
  Internetverbindung, keine Cloud, kein Verarbeitungsdritter – die
  Kita ist alleinige Verantwortliche für die Daten.
- **Zugang:** Laptop bei Nichtnutzung sperren. Im Browser-Speicher-Modus
  pro Person ein separates Browser-Profil verwenden (die Daten sind
  pro Profil isoliert); im File-Modus eine Datenfile pro Person.
- **Sicherungen:** regelmäßig ein Backup exportieren (JSON); Backups
  auf verschlüsselter Festplatte aufbewahren (Windows BitLocker /
  macOS FileVault).
- **Komplette Löschung:** Datenfile entfernen und die
  Browser-Speicherung der App löschen (IndexedDB-Datenbank
  „fair-share“).
- Optional: Kann das Gerät von anderen Personen erreicht werden,
  lässt sich in einer späteren Version eine passwortbasierte
  Verschlüsselung der Daten ergänzen.

## Sprache

Deutsch ist die Standardsprache. Der Button in der Kopfzeile zeigt
die andere Sprache an und stellt die ganze App (inklusive Menü)
darauf um; die Wahl wird gespeichert.

## Für Entwickler

Die App läuft komplett offline aus `file://` – deshalb klassische
Skripte unter dem `window.FairShare`-Namespace (ES-Module werden
unter `file://` vom Browser blockiert). Bootstrap 5.3.8 liegt
vendored in `vendor/bootstrap/`.

```
index.html           Einstiegspunkt
styles.css           kleine Override-Schicht auf Bootstrap
vendor/bootstrap/    Bootstrap 5.3.8 (offline)
js/util.js           kleine Helfer (Daten, Ids, HTML-Escaping, Preis-Skalierung)
js/defaults.js       Standard-Preisliste (lokalisiert)
js/i18n.js           I18n-Klasse (Übersetzung + Formate)
i18n/de.js, en.js    Sprach-Kataloge
js/model.js          DataModel (Datenhaltung, Mutationen, Protokoll)
js/fairness.js       Fairness-Klasse (Zuteilung, rein statisch)
js/storage.js        StorageManager (File-Modus + Browser-Modus)
js/exporters.js      Exporter (JSON, Share, CSV, Protokoll-Export)
js/views/*.js        die sechs Ansichten
js/app.js            App-Klasse (Kopplung, Speichern, Import)
tests/               Unit-Tests (node --test)
```

Tests (nur für die Entwicklung nötig – die App selbst läuft ohne
Node.js, nur Node ≥ 18 erforderlich):

```
node --test
```

### Datenformat (JSON, Version 1)

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
      "title": "Italiener-Tag",
      "seed": 123456,
      "ingredients": [
        {
          "name": "Tomaten",
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
      "data": { "title": "Italiener-Tag", "date": "2026-09-01", "count": 1, "total": 1.49 }
    }
  ],
  "priceList": [
    {
      "name": "Tomaten",
      "quantity": 500,
      "unit": "g",
      "category": "Gemüse",
      "price": 1.49
    }
  ],
  "settings": { "language": "de", "maxIngredientsPerChild": 1 }
}
```

Manuell korrigierte Zuweisungen/Preise werden mit `"manual": true`
gekennzeichnet; die Historie zeigt sie als
„manuell angepasst“. `metadata.kindergartenName` enthält den
optionalen Kita-Namen; wenn gesetzt, erscheint er im Kopf der
App statt der generischen Zeile. Er ist unter Historie →
Daten & Sicherung editierbar; ein leeres Feld löscht den
Namen wieder.

## Lizenz

Dieses Projekt ist lizenziert unter der GNU General Public
License, Version 3 oder (nach Ihrer Wahl) jeder späteren
Version – der vollständige Text steht in der Datei
[LICENSE](LICENSE).
