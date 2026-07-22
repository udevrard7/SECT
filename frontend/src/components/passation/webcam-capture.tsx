'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, RotateCcw, Check, VideoOff, AlertTriangle, Loader2 } from 'lucide-react'

interface WebcamCaptureProps {
  /** Called when the user confirms a captured photo with the base64 JPEG data URL */
  onCapture: (base64Image: string) => void
  /** Label for the skip button when webcam is unavailable */
  skipLabel?: string
  /** Called when the user skips (webcam unavailable/permission denied) */
  onSkip?: () => void
  /** Whether an upload is in progress (disables confirm button) */
  isUploading?: boolean
  /** Custom class name */
  className?: string
}

type WebcamState = 'loading' | 'active' | 'captured' | 'error' | 'unavailable'

export function WebcamCapture({
  onCapture,
  skipLabel = 'Continuer sans photo',
  onSkip,
  isUploading = false,
  className = '',
}: WebcamCaptureProps) {
  const [state, setState] = useState<WebcamState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start webcam
  const startWebcam = useCallback(async () => {
    setState('loading')
    setErrorMessage('')

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('unavailable')
      setErrorMessage('Votre navigateur ne supporte pas l\'accès à la caméra.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setState('active')
      }
    } catch (err: unknown) {
      const domErr = err as DOMException
      if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
        setState('error')
        setErrorMessage('L\'accès à la caméra a été refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur et recharger la page.')
      } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
        setState('unavailable')
        setErrorMessage('Aucune caméra détectée sur votre appareil.')
      } else if (domErr.name === 'NotReadableError' || domErr.name === 'TrackStartError') {
        setState('error')
        setErrorMessage('La caméra est utilisée par une autre application. Veuillez la fermer et réessayer.')
      } else {
        setState('error')
        setErrorMessage(`Erreur d'accès à la caméra : ${domErr.message || 'Erreur inconnue'}`)
      }
    }
  }, [])

  // Initialize webcam on mount
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setState('unavailable')
          setErrorMessage('Votre navigateur ne supporte pas l\'accès à la caméra.')
        }
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        })

        if (cancelled) {
          // Component unmounted before we got the stream
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          if (!cancelled) {
            setState('active')
          }
        }
      } catch (err: unknown) {
        if (cancelled) return
        const domErr = err as DOMException
        if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
          setState('error')
          setErrorMessage('L\'accès à la caméra a été refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur et recharger la page.')
        } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
          setState('unavailable')
          setErrorMessage('Aucune caméra détectée sur votre appareil.')
        } else if (domErr.name === 'NotReadableError' || domErr.name === 'TrackStartError') {
          setState('error')
          setErrorMessage('La caméra est utilisée par une autre application. Veuillez la fermer et réessayer.')
        } else {
          setState('error')
          setErrorMessage(`Erreur d'accès à la caméra : ${domErr.message || 'Erreur inconnue'}`)
        }
      }
    }

    init()

    // Cleanup on unmount
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [startWebcam])

  // Take a photo
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    // Mirror the image horizontally (selfie mode)
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    context.setTransform(1, 0, 0, 1, 0, 0) // Reset transform

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedImage(dataUrl)
    setState('captured')

    // Stop the video stream while previewing
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Retake photo
  const retake = useCallback(() => {
    setCapturedImage(null)
    setState('loading')
    startWebcam()
  }, [startWebcam])

  // Confirm photo
  const confirm = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage)
    }
  }, [capturedImage, onCapture])

  // Handle skip
  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Loading state */}
      {state === 'loading' && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Accès à la caméra en cours...</p>
        </div>
      )}

      {/* Active webcam preview */}
      {state === 'active' && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border-2 border-success/30 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-auto w-full max-w-md mx-auto"
              style={{ transform: 'scaleX(-1)' }} // Mirror for selfie mode
            />
            {/* Recording indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-destructive/90 px-2.5 py-1 text-xs text-white">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              Caméra active
            </div>
          </div>
          <Button onClick={takePhoto} className="w-full h-11 text-base" size="lg">
            <Camera className="h-5 w-5 mr-2" />
            Prendre une photo
          </Button>
        </div>
      )}

      {/* Captured photo preview */}
      {state === 'captured' && capturedImage && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border-2 border-success/30 bg-black">
            <img
              src={capturedImage}
              alt="Photo capturée"
              className="h-auto w-full max-w-md mx-auto"
            />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-success/90 px-2.5 py-1 text-xs text-white">
              <Check className="h-3 w-3" />
              Photo capturée
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={retake}
              variant="outline"
              className="flex-1 h-11"
              disabled={isUploading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reprendre
            </Button>
            <Button
              onClick={confirm}
              className="flex-1 h-11 text-white"
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Envoi...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmer
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-warning/40 bg-warning/5 p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-warning mb-3" />
            <p className="text-sm font-medium text-warning mb-1">Accès à la caméra impossible</p>
            <p className="text-xs text-muted-foreground max-w-sm">{errorMessage}</p>
            <Button
              onClick={startWebcam}
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
          {onSkip && (
            <Button
              onClick={handleSkip}
              variant="ghost"
              className="w-full text-muted-foreground"
            >
              {skipLabel}
            </Button>
          )}
        </div>
      )}

      {/* Unavailable state (no camera) */}
      {state === 'unavailable' && (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-6 text-center">
            <VideoOff className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">Caméra non disponible</p>
            <p className="text-xs text-muted-foreground max-w-sm">{errorMessage}</p>
          </div>
          {onSkip && (
            <Button
              onClick={handleSkip}
              variant="ghost"
              className="w-full text-muted-foreground"
            >
              {skipLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
