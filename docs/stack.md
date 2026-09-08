# Stack locale

Unico avvio dalla root: `bun run src/main.ts`, oppure
`.\bun.exe run src/main.ts` con il binario Bun nella root. `package.json` raccoglie i task Bun, senza dipendenze. Non occorrono tsconfig,
bunfig, installazioni di pacchetti o Node.js. Alias di avvio: `bun run dev`.

API native utilizzate:

- `Bun.serve`: HTTP locale, interfaccia e API sulla stessa origine.
- `Bun.build`: bundle in memoria del solo codice browser TypeScript all'avvio,
  senza dipendenze esterne. Non trasforma il modulo Emscripten già compilato.
- `Bun.file` / `Bun.write`: lettura degli asset e inizializzazione della cartella locale.
- `bun:sqlite`: persistenza locale e transazioni che riproducono il contratto
  `D1.batch`. In hosting viene iniettato il binding D1 reale.
- `Bun.Glob`: migrazioni SQL locali, applicate una volta e registrate nel database.
- `bun:test`: test automatici del modulo e del matchmaking.
- Web APIs: Request, Response, fetch, Web Crypto, Canvas, eventi DOM, WebRTC.

## Limiti attuali

Il server ricompila il client solo all'avvio: dopo modifiche TS riavviare il comando.
CSS e asset sono letti da file e serviti senza cache. Nessun HMR o dev server aggiuntivo.

Bun non ha `request.cf`: in locale si simula `EU`, modificabile con `LOCAL_REGION`.
Questa non è geolocalizzazione dell'IP. In Cloudflare si userà `request.cf.continent`.
SQLite locale verifica il contratto SQL, non le latenze/distribuzione di D1 remoto.

Il browser esegue il motore originale compilato in JavaScript (`WASM=0`). Nessun
runtime Node.js viene avviato dall'app. Il codice generato contiene anche un ramo
di compatibilità Node per eseguire gli stessi fixture sotto Bun; i sorgenti server
non importano API `node:*`. Rigenerare il motore C++ richiede separatamente la
toolchain Emscripten/CMake, che non è necessaria per avviare il risultato committato.
La toolchain di compilazione Emscripten usa propri strumenti Python e Node, fuori
dal runtime e dall'avvio locale. Il fallback senza Emscripten è in `AGENTS.md`.

La pagina utilizza Canvas 2D per presentare i pixel originali; SDL audio viene
adattato al browser dalla toolchain. WebGPU è un possibile backend di presentazione
successivo, senza modificare la simulazione.

Il server ascolta solo su loopback. Per test tra macchine servono un bind di rete
esplicito e un'origine HTTPS; WebRTC richiede inoltre STUN/TURN appropriati alle
reti coinvolte. Non è incluso un servizio TURN pubblico con credenziali.

Hosting previsto dopo la validazione locale. Non è stato eseguito alcun deploy.

## Stanze e browser

Le stanze usano il contratto SQL D1 in locale: elenco pubblico, inviti privati,
chat, heartbeat e signaling SDP/ICE. All’avvio il client misura RTT delle stanze pubbliche: preferisce la propria
regione, poi il ping minimo altrove. In assenza di host raggiungibili crea una
stanza pubblica. Tutti entrano da spettatori; due posti di gioco sono distinti
dalla proprietà della stanza. Il pulsante Play prenota un posto disponibile.
La vecchia API /api/queue resta disponibile come prototipo separato; l'interfaccia
usa /api/rooms. D1 reale e deployment non sono ancora stati verificati.

Due player eseguono lockstep su WebRTC con sei tick di buffer. La pagina dell'host
deve restare attiva: i browser limitano requestAnimationFrame in background.
Il trasporto non ha prediction/rollback né recupero automatico dell'host.
Un disallineamento degli hash ferma la partita. Gli spettatori ricevono lo storico
di input e i byte della mappa senza occupare un posto player. La cronologia è
limitata a un'ora per round. I ping mostrati misurano RTT peer-to-host, non D1.
STUN è configurato; reti che richiedono TURN possono non collegarsi.

Preferenze in localStorage; mappe importate e registrazioni in IndexedDB.
La cancellazione dei dati del sito rimuove questo archivio locale. MP4 usa
MediaRecorder con codifica MP4 effettiva: nei browser senza supporto il comando
è disabilitato, senza rinominare un WebM. Le registrazioni si fermano a 256 MB;
occorre fermarle e salvarle prima di chiudere la pagina.

Manifest, icone e service worker permettono installazione dove supportata e
cache degli asset per il gioco locale offline. HTML/client/asset usano network
first per non bloccare gli aggiornamenti locali dietro una cache obsoleta.
L'installazione dipende dalle capacità del browser e da un'origine sicura.

## Task e cartelle

`package.json` espone dev/start, test, engine, engine:wasm e assets:font/icons/maps.
Gli script sono in src/tasks e i test in src/tests. La build usa Bun.spawn con
argomenti separati, senza shell PowerShell. Emscripten richiede Python e Clang;
CMake e Ninja orchestrano i sorgenti originali. I percorsi si risolvono da
EMSDK, EMSDK_PYTHON, CMAKE e NINJA, dalla toolchain .tools oppure dal PATH.
La verifica della scoperta automatica è stata eseguita su Windows.

Output e cache sono sotto .local/build; vecchi esperimenti in .local/archive.
TC, pkg e metadati CMake restano ai percorsi originali per compatibilità upstream.
La root TEMPLE.LEV resta il file originale dell’utente.

Paese della stanza: request.cf.country in hosting; LOCAL_COUNTRY in locale.
Senza un paese noto si mostra un globo, senza inventare una bandiera.

Le 897 mappe e le anteprime sono asset inclusi nel repository; nessuna dipendenza
da WebLiero per caricamento o gioco. Il service worker conserva le mappe già
visitate per l’uso offline, senza scaricare automaticamente l’intero archivio.
