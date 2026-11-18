import AuthenticationServices
import Capacitor
import Foundation

/// Internet Identity sign-in for the iOS app.
///
/// Opens the identity provider in an ASWebAuthenticationSession and finishes
/// when it navigates to the app's https callback (ICRC-167). An https callback
/// is matched by the system against the app's associated domains, so no other
/// app can receive it, which is why ICRC-167 allows it and forbids custom URL
/// schemes. Needs iOS 17.4; older versions fall back to the browser plugin and
/// a universal link (see frontend/src/lib/nativeAuth.ts).
@objc(NativeAuthPlugin)
public class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              let host = call.getString("callbackHost"),
              let path = call.getString("callbackPath") else {
            call.reject("url, callbackHost and callbackPath are required")
            return
        }
        guard #available(iOS 17.4, *) else {
            call.unavailable("ASWebAuthenticationSession https callbacks need iOS 17.4")
            return
        }

        DispatchQueue.main.async {
            self.session?.cancel()
            let session = ASWebAuthenticationSession(
                url: url,
                callback: .https(host: host, path: path)
            ) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in was canceled", "CANCELED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed", "FAILED", error)
                }
            }
            session.presentationContextProvider = self
            // Share Safari's cookies so a passkey session at id.ai carries over.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open the sign-in sheet", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
