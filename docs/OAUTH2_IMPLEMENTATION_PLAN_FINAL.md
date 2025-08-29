# OAuth2 User Authentication Implementation Plan (Final)

## ✅ Plan Validation
Your proposed improvements are **valid and recommended**. The plan combines the existing docs/OAUTH2_IMPLEMENTATION_PLAN.md with your suggested enhancements for a cleaner architecture.

## 📋 Implementation Overview

### Phase 1: Create AuthProvider Interface & Refactor (Red Phase)

#### 1.1 Create AuthProvider Interface
**File**: `src/services/auth/auth-provider.interface.ts`
- Define common methods: `initialize()`, `getAuthClient()`, `validateAuth()`, `refreshToken()`, `getAuthInfo()`
- Support both service account and OAuth2 authentication
- Return types use GoogleWorkspaceResult pattern

#### 1.2 Refactor Existing AuthService
**Original**: `src/services/auth.service.ts`
**New**: `src/services/auth/service-account-auth.provider.ts`
- Rename to `ServiceAccountAuthProvider` 
- Implement AuthProvider interface
- Maintain all existing functionality (retries, timeouts, error handling)
- Keep existing GoogleService base class integration

#### 1.3 Add OAuth2AuthProvider
**File**: `src/services/auth/oauth2-auth.provider.ts`
- Implement AuthProvider interface
- Use OAuth2Client from google-auth-library
- Support Installed Application Flow with local callback server
- Integrate with existing retry/timeout infrastructure

#### 1.4 Create AuthFactory
**File**: `src/services/auth/auth-factory.ts`
- Factory pattern to create appropriate auth provider based on GOOGLE_AUTH_MODE
- Handle provider initialization
- Provide fallback logic

#### 1.5 Write Tests First (TDD)
- `src/services/auth/auth-provider.interface.test.ts`
- `src/services/auth/service-account-auth.provider.test.ts` 
- `src/services/auth/oauth2-auth.provider.test.ts`
- `src/services/auth/auth-factory.test.ts`
- `src/services/auth/token-storage.service.test.ts`

### Phase 2: OAuth2 Implementation (Green Phase)

#### 2.1 Environment Variable Configuration
**File**: `src/config/index.ts`
```
GOOGLE_AUTH_MODE=service-account | oauth2
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=... (comma-separated)
```

#### 2.2 Token Storage Service
**File**: `src/services/auth/token-storage.service.ts`
- Use keytar for secure OS storage (Keychain/Credential Manager/Secret Service)
- Fallback to encrypted file storage (~/.config/google-workspace-mcp/)
- Methods: `saveTokens()`, `getTokens()`, `deleteTokens()`, `clearTokens()`
- Handle storage errors gracefully

#### 2.3 OAuth2 Flow Implementation
**Core Features**:
- Generate authorization URL with `access_type: 'offline'` for refresh token
- Spawn local HTTP server for callback (using http + server-destroy)
- Open browser automatically (using open library)
- Exchange authorization code for tokens
- Store refresh token securely
- Handle user denial/cancellation

#### 2.4 Update Configuration Schema
**File**: `src/config/index.ts`
- Add new OAuth2 environment variables to Zod schema
- Support auth mode selection with validation
- Maintain backward compatibility

#### 2.5 Update ServiceRegistry Integration
**File**: `src/registry/service-registry.ts`
- Use AuthFactory to create appropriate auth provider
- Pass auth provider to service modules
- Handle auth provider errors during initialization

### Phase 3: Integration & Polish (Refactor Phase)

#### 3.1 Create Unified AuthService
**File**: `src/services/auth/auth.service.ts`
- Wrapper that delegates to appropriate provider
- Maintains backward compatibility with existing code
- Handles provider switching logic
- Preserves existing method signatures

#### 3.2 Error Handling Enhancement
**New Error Classes**:
- `GoogleOAuth2AuthenticationError`
- `GoogleOAuth2TokenExpiredError`
- `GoogleOAuth2UserDeniedError`
- `GoogleTokenStorageError`

**Features**:
- Handle token expiration gracefully
- Implement automatic token refresh
- Provide clear error messages to users

#### 3.3 User Experience Improvements
- Clear console prompts during OAuth flow
- Display authentication status and token expiry
- Handle re-authentication scenarios
- Graceful handling of browser opening failures
- Progress indicators during token exchange

#### 3.4 Update Main Application
**File**: `src/index.ts`
- Update initializeServices() to use AuthFactory
- Handle different auth modes
- Maintain existing error handling patterns

#### 3.5 Documentation Updates
- Update README with OAuth2 setup instructions
- Add examples for both auth modes
- Document environment variables
- Provide troubleshooting guide

## 🛠️ Dependencies to Install

### Production Dependencies
```bash
npm install --save keytar open server-destroy
```

### Development Dependencies  
```bash
npm install --save-dev @types/server-destroy
```

### Alternative for keytar (if needed)
If keytar installation fails, prepare fallback to `node-keytar` or file-based storage only.

## 🔄 Implementation Timeline

### Day 1: Foundation (Phase 1)
- [ ] Create AuthProvider interface
- [ ] Write comprehensive tests (TDD Red phase)
- [ ] Refactor existing AuthService to ServiceAccountAuthProvider
- [ ] Create AuthFactory structure

### Day 2: Core OAuth2 Implementation (Phase 2)  
- [ ] Implement TokenStorage service with keytar
- [ ] Create OAuth2AuthProvider with full flow
- [ ] Update configuration schema
- [ ] Integration with ServiceRegistry

### Day 3: Integration & Polish (Phase 3)
- [ ] Create unified AuthService wrapper
- [ ] Enhanced error handling and UX
- [ ] Update main application integration
- [ ] Documentation and testing

## ✅ Success Criteria

### Functional Requirements
- [ ] All existing tests pass after refactoring
- [ ] OAuth2 flow works end-to-end (browser → consent → callback → tokens)
- [ ] Tokens are stored securely in OS keychain
- [ ] Automatic token refresh works seamlessly
- [ ] Can switch between auth modes via GOOGLE_AUTH_MODE
- [ ] Maintains 100% backward compatibility

### Technical Requirements  
- [ ] No breaking changes to existing API
- [ ] Follows existing code patterns and conventions
- [ ] Comprehensive test coverage (>90%)
- [ ] Proper error handling and logging
- [ ] Security best practices implemented

### User Experience Requirements
- [ ] Clear setup instructions for OAuth2
- [ ] Intuitive error messages
- [ ] Smooth authentication flow
- [ ] Graceful handling of edge cases

## 🔐 Security Considerations

### Token Security
- Never log tokens, refresh tokens, or sensitive credentials
- Use secure storage (keytar) for refresh tokens
- Implement proper token rotation
- Clear tokens from memory after use

### OAuth2 Security
- Validate redirect URIs strictly
- Use state parameter to prevent CSRF
- Consider implementing PKCE for additional security
- Set appropriate token scopes (principle of least privilege)

### File Security
- Set restrictive file permissions (600) for fallback storage
- Encrypt stored tokens in fallback scenarios  
- Use proper random salt for encryption keys
- Secure deletion of temporary files

## 📝 Implementation Notes

### Context7 Research Findings
- **google-auth-library-nodejs** is the official and most maintained library
- **Installed Application Flow** is the standard for CLI/desktop applications
- **OAuth2Client** class provides comprehensive OAuth2 support
- Token refresh is handled automatically by the library
- Strong community support and documentation

### Architecture Decisions
- **AuthProvider Interface**: Enables clean separation and testability
- **Factory Pattern**: Simplifies auth mode switching
- **Delegation Pattern**: Maintains backward compatibility
- **TDD Approach**: Ensures robust implementation
- **Environment-based Configuration**: Follows 12-factor app principles

### Risk Mitigation
- Extensive testing before production deployment
- Graceful fallbacks for authentication failures
- Clear migration path for existing installations
- Comprehensive error logging for debugging
- User documentation for troubleshooting

## 🔧 Environment Variable Reference

### Service Account Mode (Existing)
```bash
GOOGLE_AUTH_MODE=service-account
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
```

### OAuth2 Mode (New)
```bash
GOOGLE_AUTH_MODE=oauth2
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar
```

### Shared Configuration (Existing)
```bash
GOOGLE_DRIVE_FOLDER_ID=optional-folder-id
GOOGLE_RETRY_MAX_ATTEMPTS=3
GOOGLE_RETRY_BASE_DELAY=1000
GOOGLE_RETRY_MAX_DELAY=30000
GOOGLE_REQUEST_TIMEOUT=30000  
GOOGLE_TOTAL_TIMEOUT=120000
```

This plan provides a comprehensive, secure, and maintainable approach to adding OAuth2 user authentication while preserving all existing functionality and following established patterns in the codebase.