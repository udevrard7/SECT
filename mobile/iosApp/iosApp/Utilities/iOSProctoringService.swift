// SECT Mobile — iOS Proctoring Implementation (SwiftUI reference)
// Surveillance d'examen sur iOS : lifecycle, fullscreen, caméra
//
// Implémentation iOS (à intégrer dans le projet Xcode) :
//
// 1. Détection de tab switch / app background :
//    - Utiliser NotificationCenter avec UIApplication.willResignActiveNotification
//    - Quand l'app passe en arrière-plan → alerte
//
// 2. Mode plein écran (kiosk) :
//    - Utiliser UIAccessibility.isGuidedAccessEnabled
//    - OU UIScreen.main.isCaptured pour la détection de capture
//    - Recommander le mode Guided Access (Accès guidé) de l'iPad
//
// 3. Caméra (AVCaptureSession) :
//    - Captures périodiques via AVCapturePhotoOutput
//    - Envoyer les frames en base64 via le WebSocket
//
// 4. Face detection (Vision framework) :
//    - VNDetectFaceRectanglesRequest sur chaque frame
//    - Alerte si nombre de visages != 1
//
// Code Swift de référence :

/*
import SwiftUI
import AVFoundation
import Vision

class iOSProctoringService: NSObject, ObservableObject {
    @Published var alertCount = 0
    @Published var shouldTerminate = false

    private var config: ProctoringConfig?
    private var captureSession: AVCaptureSession?
    private var websocket: SurveillanceWebSocket?

    func start(config: ProctoringConfig) {
        self.config = config

        // Observer le lifecycle
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )

        // Démarrer la caméra si activée
        if config.enableWebcam {
            startCamera()
        }
    }

    @objc private func appWillResignActive() {
        reportEvent(.tabSwitch)
    }

    private func startCamera() {
        captureSession = AVCaptureSession()
        guard let session = captureSession,
              let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device) else { return }

        session.addInput(input)
        session.startRunning()
    }

    func reportEvent(_ event: ProctoringEvent) {
        let increment = event.severity.alertIncrement
        alertCount += increment
        shouldTerminate = alertCount >= (config?.maxAlerts ?? 10)

        // Envoyer via WebSocket
        Task {
            await websocket?.sendAlert(type: event.rawValue)
        }
    }
}
*/
