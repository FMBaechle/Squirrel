# Squirrel

Ausgaben in Sekunden erfassen und auswerten, auch offline. Die App läuft als Web-App (PWA) auf dem Handy-Homescreen. Datenbasis ist ein Google Sheet.

- **Schnelle Eingabe:** Betrag über ein eigenes Ziffernfeld, Kategorie antippen, speichern. Häufige Ausgaben erscheinen als Vorlagen.
- **Ansichten:** Ausgaben nach Tag oder Monat, Analyse mit Budgets und 12-Monats-Verlauf, Einstellungen für Kategorien, Tags und wiederkehrende Ausgaben.
- **Offline:** App und Daten liegen auf dem Gerät. Änderungen werden synchronisiert, sobald wieder Netz da ist.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html`, `app.css`, `app.js` | Die App, reines HTML/CSS/JS ohne Build-Schritt |
| `sw.js` | Service Worker: lädt die App sofort aus dem Gerätespeicher, auch offline |
| `manifest.webmanifest`, `icons/` | Name und Eichhörnchen-Icon für den Homescreen |
| `apps-script/Code.gs` | Schnittstelle im Google Sheet, die die App beim Sync aufruft |

Die App speichert alles in IndexedDB. Jede Änderung kommt zusätzlich in eine Warteschlange. Beim Sync schickt die App diese Warteschlange an das Apps Script und bekommt den vollständigen Stand des Sheets zurück. Wiederkehrende Ausgaben bucht die App selbst. Feste IDs (`r-<Regel>-<Datum>`) verhindern dabei doppelte Buchungen.

## Einrichtung

### 1. App veröffentlichen (GitHub Pages)

1. Im Repository: **Settings → Pages**.
2. Bei „Source“ **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach etwa einer Minute ist die App unter `https://fmbaechle.github.io/squirrel/` erreichbar.

GitHub Actions werden nicht gebraucht. Jeder Push auf `main` ist automatisch live.

### 2. Google Sheet anbinden

1. Ein neues Google Sheet anlegen, z. B. „Squirrel“.
2. **Erweiterungen → Apps Script** öffnen, den Inhalt von [`apps-script/Code.gs`](apps-script/Code.gs) einfügen und speichern.
3. Oben die Funktion **`setup`** auswählen und **Ausführen** klicken. Den Zugriff erlauben.
   Danach gibt es die Tabs Ausgaben, Kategorien, Wiederkehrend und Tags. Den Zugangsschlüssel findest du im Tab **Squirrel**, Zelle B2.
4. **Bereitstellen → Neue Bereitstellung**, Typ **Web-App**:
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   Dann **Bereitstellen** klicken und die Web-App-URL kopieren (endet auf `/exec`).
5. In der App unter **Einstellungen → Google Sheet** die URL und den Zugangsschlüssel eintragen und auf **Verbinden** tippen.

Beim ersten Verbinden lädt die App ihre Kategorien, Tags und bisherigen Ausgaben ins leere Sheet hoch. Ein weiteres Gerät übernimmt dagegen den Stand des Sheets.

„Zugriff: Jeder“ ist nötig, damit die App ohne Google-Login zugreifen kann. Geschützt ist die Schnittstelle durch den Zugangsschlüssel. Ist er bekannt geworden, erzeugt die Funktion `neuerSchluessel` einen neuen.

Wenn du `Code.gs` später änderst, unter **Bereitstellen → Bereitstellungen verwalten** eine neue Version der bestehenden Bereitstellung anlegen. So bleibt die URL gleich.

### 3. Auf den Homescreen legen

- **iPhone:** die App-Adresse in Safari öffnen, **Teilen → Zum Home-Bildschirm**.
- **Android:** in Chrome über das Menü **App installieren** oder direkt über den Button in den Einstellungen der App.

## Im Sheet bearbeiten

Du kannst Einträge auch direkt im Sheet ändern. Die App übernimmt sie beim nächsten Sync. Datumswerte stehen als Text im Format `JJJJ-MM-TT`, Tags kommagetrennt. Damit wiederkehrende Ausgaben richtig zugeordnet bleiben, sollte die Spalte `id` nicht verändert werden.

## Lokal ausprobieren

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```
