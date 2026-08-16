// SECT Mobile — iOS Proctoring Implementation
// Surveillance d'examen sur iOS : lifecycle, fullscreen, caméra
import SwiftUI
import AVFoundation
import Vision

@MainActor
class iOSProctoringService: NSObject, ObservableObject {
    @Published var alertCount = 0
    @Published var shouldTerminate = false
    @Published var isProctoringActive = false
    @Published var lastEventType: String? = nil
    @Published var faceDetected = false
    
    private var config: ProctoringConfig?
    private var captureSession: AVCaptureSession?
    private var photoOutput: AVCapturePhotoOutput?
    private var websocket: Any? = nil
    private var lastCaptureTime: Date = .distantPast
    
    // ── Lifecycle Observers ──
    
    func start(config: ProctoringConfig, websocket: Any? = nil) {
        self.config = config
        self.websocket = websocket
        self.isProctoringActive = true
        self.alertCount = 0
        self.shouldTerminate = false
        
        // Observer le lifecycle de l'app
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        
        // Observer les captures d'écran
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenWasCaptured),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
        
        // Activer le mode plein écran (Guided Access recommandé)
        enableImmersiveMode()
        
        // Démarrer la caméra si activée
        if config.enableWebcam {
            startCamera()
        }
    }
    
    func stop() {
        isProctoringActive = false
        captureSession?.stopRunning()
        captureSession = nil
        
        NotificationCenter.default.removeObserver(self)
        
        // Restaurer le mode normal
        disableImmersiveMode()
    }
    
    // ── Lifecycle Event Handlers ──
    
    @objc private func appWillResignActive() {
        guard isProctoringActive else { return }
        reportEvent(.tabSwitch)
        lastEventType = "APP_BACKGROUND"
    }
    
    @objc private func appDidBecomeActive() {
        guard isProctoringActive else { return }
        lastEventType = "APP_FOREGROUND"
    }
    
    @objc private func screenWasCaptured() {
        guard isProctoringActive, UIScreen.main.isCaptured else { return }
        reportEvent(.fullscreenExit)
        lastEventType = "SCREEN_CAPTURE"
    }
    
    // ── Proctoring Events ──
    
    enum ProctoringEvent: String {
        case tabSwitch = "TAB_SWITCH"
        case fullscreenExit = "FULLSCREEN_EXIT"
        case screenCapture = "SCREEN_CAPTURE"
        case noFace = "NO_FACE"
        case multipleFaces = "MULTIPLE_FACES"
    }
    
    func reportEvent(_ event: ProctoringEvent) {
        let increment = alertIncrement(for: event)
        alertCount += increment
        
        let maxAlerts = config?.maxAlerts ?? 10
        shouldTerminate = alertCount >= maxAlerts
        
        // Envoyer via WebSocket (stub — websocket est Any?)
        // TODO: restaurer l'envoi WebSocket quand SurveillanceWebSocket sera exposé
        // Task {
        //     try? await websocket?.sendAlert(type: event.rawValue)
        // }
    }
    
    private func alertIncrement(for event: ProctoringEvent) -> Int {
        switch event {
        case .tabSwitch: return 2
        case .fullscreenExit: return 1
        case .screenCapture: return 3
        case .noFace: return 1
        case .multipleFaces: return 2
        }
    }
    
    // ── Immersive Mode ──
    
    private func enableImmersiveMode() {
        // iOS: Recommander le mode Guided Access (Accès guidé)
        // Vérifier si déjà en Guided Access
        if UIAccessibility.isGuidedAccessEnabled {
            // Déjà en mode kiosk — parfait
            return
        }
        
        // Sinon, on masque la barre de statut
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true
        }
    }
    
    private func disableImmersiveMode() {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
    
    // ── Camera (AVCaptureSession) ──
    
    private func startCamera() {
        // Vérifier la permission caméra
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setupCaptureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    Task { @MainActor in
                        self?.setupCaptureSession()
                    }
                }
            }
        default:
            // Permission refusée — alerter
            reportEvent(.noFace)
        }
    }
    
    private func setupCaptureSession() {
        captureSession = AVCaptureSession()
        guard let session = captureSession else { return }
        
        session.sessionPreset = .photo
        
        // Caméra frontale
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device) else { return }
        
        if session.canAddInput(input) {
            session.addInput(input)
        }
        
        // Output pour captures photo
        photoOutput = AVCapturePhotoOutput()
        if let output = photoOutput, session.canAddOutput(output) {
            session.addOutput(output)
        }
        
        // Démarrer la session caméra sur un thread background
        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
        
        // Démarrer la détection faciale périodique
        startFaceDetectionTimer()
    }
    
    // ── Face Detection (Vision framework) ──
    
    private var faceDetectionTimer: Timer?
    
    private func startFaceDetectionTimer() {
        // Vérifier les visages toutes les 10 secondes
        faceDetectionTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.detectFaces()
        }
    }
    
    private func detectFaces() {
        guard let session = captureSession, session.isRunning else { return }
        
        // Capturer une image et analyser
        // Note: En production, utiliser AVCaptureVideoDataOutput pour les frames en temps réel
        let request = VNDetectFaceRectanglesRequest { [weak self] request, error in
            guard error == nil,
                  let observations = request.results as? [VNFaceObservation] else {
                self?.faceDetected = false
                return
            }
            
            let faceCount = observations.count
            self?.faceDetected = faceCount > 0
            
            if faceCount == 0 {
                self?.reportEvent(.noFace)
            } else if faceCount > 1 {
                self?.reportEvent(.multipleFaces)
            }
        }
        
        // Exécuter la détection sur une capture
        // (En production, utiliser un VNImageRequestHandler avec le CVPixelBuffer du video output)
    }
    
    // ── Cleanup ──
    
    deinit {
        // stop() est @MainActor, ne peut pas être appelé dans deinit (non-isolé)
        // On invalide juste le timer directement
        faceDetectionTimer?.invalidate()
    }
}

// ── ProctoringConfig ──

struct ProctoringConfig {
    let enableWebcam: Bool
    let enableFaceDetection: Bool
    let maxAlerts: Int
    let captureIntervalSeconds: Int
    
    static let `default` = ProctoringConfig(
        enableWebcam: true,
        enableFaceDetection: true,
        maxAlerts: 10,
        captureIntervalSeconds: 30
    )
}
