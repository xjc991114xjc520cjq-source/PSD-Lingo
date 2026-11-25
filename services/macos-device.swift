import Foundation
import Security
import CryptoKit
import CoreText

// Login Keychain holds the AES key and an opaque, device-bound Secure Enclave
// representation. The latter is not a software private key. This also permits
// local test builds without inventing a restricted data-protection access group.
enum DeviceFailure: Error { case failed(String) }
let keyTag = Data("PSDLingo.Device.mac.v1".utf8)
let secretService = "PSDLingo.Secrets.mac.v1"
let aad = Data("PSDLingo.Secrets.mac.v1".utf8)
func check(_ status: OSStatus) throws {
    guard status == errSecSuccess else { throw DeviceFailure.failed("keychain status \(status)") }
}
func storedSecret(_ account: String) throws -> Data? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: secretService, kSecAttrAccount as String: account,
        kSecReturnData as String: true]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    try check(status)
    guard let value = item as? Data else { throw DeviceFailure.failed("invalid keychain data") }
    return value
}
func storeSecret(_ bytes: Data, account: String) throws -> Data {
    // Default login Keychain ACL binds access to the creating signed helper;
    // never trust all applications and never overwrite an existing identity.
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: secretService, kSecAttrAccount as String: account,
        kSecValueData as String: bytes]
    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
        guard let existing = try storedSecret(account) else { throw DeviceFailure.failed("keychain race") }
        return existing
    }
    try check(status)
    return bytes
}
func privateKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
    guard SecureEnclave.isAvailable else { throw DeviceFailure.failed("Secure Enclave unavailable") }
    let account = "secure-enclave-wrapped-v1"
    if let stored = try storedSecret(account) {
        return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: stored)
    }
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        .privateKeyUsage, &error) else { throw DeviceFailure.failed("access control") }
    let created = try SecureEnclave.P256.Signing.PrivateKey(compactRepresentable: false, accessControl: access)
    let stored = try storeSecret(created.dataRepresentation, account: account)
    return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: stored)
}
func encryptionKey(create: Bool) throws -> SymmetricKey {
    let account = "aes-gcm-v1"
    if let bytes = try storedSecret(account) {
        guard bytes.count == 32 else { throw DeviceFailure.failed("invalid encryption key") }
        return SymmetricKey(data: bytes)
    }
    guard create else { throw DeviceFailure.failed("encryption key missing") }
    let key = SymmetricKey(size: .bits256)
    let stored = try storeSecret(key.withUnsafeBytes { Data($0) }, account: account)
    guard stored.count == 32 else { throw DeviceFailure.failed("invalid encryption key") }
    return SymmetricKey(data: stored)
}
func decode(_ value: String?, limit: Int = 512 * 1024) throws -> Data {
    guard let value = value, let data = Data(base64Encoded: value), data.count <= limit else {
        throw DeviceFailure.failed("invalid base64")
    }
    return data
}
func installFont(_ file: String?) throws -> [String: Any] {
    guard let file = file, file.hasPrefix("/"), !file.contains("\0") else { throw DeviceFailure.failed("invalid font path") }
    let source = URL(fileURLWithPath: file)
    let ext = source.pathExtension.lowercased()
    guard ["ttf", "otf", "ttc"].contains(ext) else { throw DeviceFailure.failed("invalid font type") }
    let attributes = try FileManager.default.attributesOfItem(atPath: file)
    guard let size = attributes[.size] as? NSNumber, size.intValue >= 12, size.intValue <= 80 * 1024 * 1024,
          attributes[.type] as? FileAttributeType == .typeRegular else { throw DeviceFailure.failed("invalid font size/type") }
    let bytes = try Data(contentsOf: source)
    let magic = Array(bytes.prefix(4))
    guard magic == [0, 1, 0, 0] || ["OTTO", "ttcf", "true"].contains(String(bytes: magic, encoding: .ascii) ?? "") else {
        throw DeviceFailure.failed("invalid font header")
    }
    guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(source as CFURL) as? [CTFontDescriptor], !descriptors.isEmpty else {
        throw DeviceFailure.failed("invalid font descriptors")
    }
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let fonts = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Fonts", isDirectory: true)
    try FileManager.default.createDirectory(at: fonts, withIntermediateDirectories: true)
    let destination = fonts.appendingPathComponent("Sparkit-" + hash + "." + ext)
    if FileManager.default.fileExists(atPath: destination.path) {
        guard try Data(contentsOf: destination) == bytes else { throw DeviceFailure.failed("font destination changed") }
    } else {
        try bytes.write(to: destination, options: .withoutOverwriting)
    }
    var error: Unmanaged<CFError>?
    if !CTFontManagerRegisterFontsForURL(destination as CFURL, .persistent, &error) {
        guard let problem = error?.takeRetainedValue(), CFErrorGetCode(problem) == 105 else {
            throw DeviceFailure.failed("font registration failed")
        }
    }
    return ["installed": true, "sha256": hash]
}
func execute(_ request: [String: String]) throws -> [String: Any] {
    switch request["op"] {
    case "capabilities": return ["secureEnclave": SecureEnclave.isAvailable, "platform": "darwin", "protocol": 1]
    case "identity":
        return ["spki": try privateKey().publicKey.derRepresentation.base64EncodedString()]
    case "sign":
        let signature = try privateKey().signature(for: decode(request["value"]))
        return ["signature": signature.rawRepresentation.base64EncodedString()]
    case "protect":
        let box = try AES.GCM.seal(decode(request["value"]), using: encryptionKey(create: true), authenticating: aad)
        guard let combined = box.combined else { throw DeviceFailure.failed("seal") }
        return ["value": "mac-keychain-v1:" + combined.base64EncodedString()]
    case "unprotect":
        guard let value = request["value"], value.hasPrefix("mac-keychain-v1:") else {
            throw DeviceFailure.failed("unsupported ciphertext")
        }
        let bytes = try decode(String(value.dropFirst("mac-keychain-v1:".count)), limit: 512 * 1024 + 28)
        let box = try AES.GCM.SealedBox(combined: bytes)
        let plain = try AES.GCM.open(box, using: encryptionKey(create: false), authenticating: aad)
        return ["value": plain.base64EncodedString()]
    case "install-font": return try installFont(request["path"])
    default: throw DeviceFailure.failed("unsupported operation")
    }
}
do {
    // Bound input even when a caller is faulty; stdout carries only the JSON response.
    var input = Data()
    while true {
        let part = FileHandle.standardInput.readData(ofLength: 4096)
        if part.isEmpty { break }
        input.append(part)
        guard input.count <= 1024 * 1024 else { throw DeviceFailure.failed("request size") }
    }
    guard let request = try JSONSerialization.jsonObject(with: input) as? [String: String] else {
        throw DeviceFailure.failed("invalid request")
    }
    let response = try JSONSerialization.data(withJSONObject: execute(request), options: [.sortedKeys])
    FileHandle.standardOutput.write(response)
    FileHandle.standardOutput.write(Data([10]))
} catch {
    FileHandle.standardError.write(Data("Mac device operation failed; check Keychain and helper signing.\n".utf8))
    exit(1)
}
