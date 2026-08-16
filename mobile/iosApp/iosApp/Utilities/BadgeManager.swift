//
//  BadgeManager.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-E : holder central des compteurs de badges.
//  Miroir iOS de BadgeManager (Android).
//
import SwiftUI
import Combine

@MainActor
class BadgeManager: ObservableObject {
    static let shared = BadgeManager()

    @Published var unreadMessages: Int = 0
    @Published var pendingCorrections: Int = 0

    private init() {}

    func setUnreadMessages(_ count: Int) {
        unreadMessages = count
    }

    func setPendingCorrections(_ count: Int) {
        pendingCorrections = count
    }

    func incrementUnread() {
        unreadMessages += 1
    }

    func decrementUnread() {
        if unreadMessages > 0 { unreadMessages -= 1 }
    }
}
