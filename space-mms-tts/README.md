---
title: SECT MMS-TTS French
emoji: 🗣️
colorFrom: cyan
colorTo: teal
sdk: gradio
sdk_version: "4.44.1"
app_file: app.py
pinned: false
license: mit
---

# SECT MMS-TTS French

Space Gradio hébergeant `facebook/mms-tts-fra` pour la génération de podcasts
français natifs dans l'application SECT.

## Utilisation

Ce Space expose une API Gradio `/predict` avec un seul input : `[text]`.
Il retourne un fichier WAV (16kHz, 16-bit, mono).

L'application SECT (backend Go) appelle cet Space via le protocole Gradio 4 :
1. POST `/gradio_api/call/predict` avec `{"data":["texte à synthétiser"]}`
2. GET `/gradio_api/call/predict/{event_id}` (SSE stream)
3. GET l'URL du fichier WAV retourné

## Modèle

**facebook/mms-tts-fra** — VITS (Variational Inference with adversarial
learning for end-to-end Text-to-Speech) entraîné sur 1100+ langues dont le
français. Voix française native, pas d'accent étranger, pas de voice cloning.
