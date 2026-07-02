import gradio as gr
import torch
from transformers import VitsModel, AutoTokenizer
import numpy as np

# Charger le modèle MMS-TTS French au démarrage du Space.
# Le modèle est mis en cache par HuggingFace après le premier téléchargement.
print("Loading facebook/mms-tts-fra model...")
model = VitsModel.from_pretrained("facebook/mms-tts-fra")
tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-fra")
model.eval()
print(f"Model loaded. Sample rate: {model.config.sampling_rate} Hz")


def predict(text):
    """Synthétise du texte français en audio WAV.

    Args:
        text: Texte à synthétiser (français). Max ~500 caractères recommandé
              (le backend Go fait le chunking pour les textes longs).

    Returns:
        Tuple (sample_rate, audio_array) au format attendu par gr.Audio.
    """
    if not text or not text.strip():
        return None

    # Tokenizer et génération
    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        output = model(**inputs).waveform

    # Convertir en numpy pour Gradio
    audio_np = output.squeeze().numpy()
    return (model.config.sampling_rate, audio_np)


# Interface Gradio simple : textbox → audio
demo = gr.Interface(
    fn=predict,
    inputs=gr.Textbox(
        label="Texte à synthétiser",
        placeholder="Tapez du texte en français...",
        lines=3,
    ),
    outputs=gr.Audio(label="Audio généré"),
    title="SECT MMS-TTS French",
    description="Synthèse vocale française native (facebook/mms-tts-fra). API: POST /gradio_api/call/predict",
    examples=[["Bonjour et bienvenue dans ce podcast de révision."]],
)

if __name__ == "__main__":
    demo.launch()
