# 🎹 Atelier Piano

PWA personnelle (aucun App Store) pour iPad et ordinateur :

1. **Transcrire** un morceau de piano (fichier audio ou micro) en MIDI avec le modèle Basic Pitch (Apache 2.0) — tout se passe sur l'appareil, sauvegarde sous le nom de votre choix.
2. **Jouer** le morceau : synthèse Web Audio, clavier affiché avec les touches actives surlignées, **vitesse réglable de 25 à 150 %**.
3. **Apprendre** : branchez votre piano (USB ou Bluetooth MIDI) — vos notes s'affichent sur un second clavier, **vert** si juste, **rouge** si faux, avec compteur.
4. **Morceaux intégrés** (Au clair de la lune, Ode à la joie, Lettre à Élise…), **exercices** (gammes, arpèges), **mélodies aléatoires** et import de notation.

## Installation sur iPad (2 minutes)

1. Hébergez ce dossier en HTTPS (par ex. GitHub Pages) et ouvrez l'URL dans Safari.
2. Safari → bouton **Partager** → **« Sur l'écran d'accueil »** → Ajouter. L'app est maintenant une icône plein écran, utilisable hors ligne.

## Branchement du piano

⚠️ **Safari iPad ne supporte pas Web MIDI** (blocage Apple, comme tous les navigateurs iPadOS — [caniuse.com/midi](https://caniuse.com/midi)). Deux solutions :

- **MIDIWeb Browser** (app gratuite de l'App Store, [midiweb.app](https://midiweb.app/)) : ouvrez l'URL de l'app dans ce navigateur ; USB (adaptateur caméra) et Bluetooth MIDI fonctionnent.
- **Chrome/Edge sur PC/Mac** : Web MIDI natif, piano en USB.

Le playback et la transcription marchent partout (Safari compris).

## Demander des morceaux générés

Demandez à Vibe (« génère-moi un morceau ») : la réponse contient une notation à coller dans
**« Coller une notation de morceau »** en bas de l'app. Format :

```
tempo=90
C4:1 D4:1 E4:1 | r:1
C3:2 G2:2
```

Une ligne = une voix (main droite puis main gauche). Notes : `C4` = Do central ; `#`/`b` ;
durée en temps après `:` (défaut 1, `.5` = croche) ; `r:1` = silence ; `|` ignoré.

## Technique

- Vanilla JS, aucun build. PWA : manifest + service worker (`sw.js`).
- Encodeur/décodeur MIDI format 0 maison (`midi.js`), testé sous Node (`npm test`).
- Stockage IndexedDB (les MIDI restent dans l'iPad) + export `.mid`.
- Transcription : modèle Basic Pitch (TFJS) chargé au premier usage depuis le CDN, mis en cache par le service worker.

## Limites connues

- Impossible de capter le son des plateformes de streaming (DRM) : enregistrer au micro ou importer un fichier audio à la place.
- La transcription est optimale sur **piano seul** ; sur un mixage complet (batterie, voix…), le résultat est bruité.
- La première transcription nécessite internet (modèle ~900 Ko depuis le CDN) ; ensuite il est mis en cache.
