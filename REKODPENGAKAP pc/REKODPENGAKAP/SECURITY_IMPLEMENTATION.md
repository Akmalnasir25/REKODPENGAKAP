# Security Implementation - High Priority Fixes

## ✅ Implemented Features

### 1. **Rate Limiting (Anti-Brute Force)**
- **File**: `services/security.ts`
- **Functionality**:
  - Max 5 login attempts per 15 minutes
  - Automatic lockout after exceeding limit
  - Timer displayed to user showing remaining lockout time
  - Resets on successful login

**How it works:**
```typescript
const { canAttempt, timeRemaining } = checkLoginAttempts();
recordLoginAttempt(success); // Track failed/successful attempts
```

### 2. **CSRF Token Protection**
- **File**: `services/security.ts`, `services/api.ts`
- **Functionality**:
  - Unique token generated per session (24-hour expiry)
  - Token sent with every login request
  - Backend should validate token before processing

**Implementation**:
```typescript
const csrfToken = generateCSRFToken();
// Token included in login requests
await loginUser(scriptUrl, { schoolCode, password, csrfToken });
```

### 3. **Session Timeout (30 minutes)**
- **File**: `App.tsx`, `services/security.ts`
- **Functionality**:
  - Session automatically expires after 30 minutes of inactivity
  - Activity tracked on: mouse, keyboard, scroll, touch
  - User auto-logged out with alert notification
  - Session timestamp updated with each activity

**Monitoring**:
- Runs check every 60 seconds
- Listeners attached to document events
- Automatic cleanup on logout

### 4. **Enhanced Session Management**
- Tracks last activity time in localStorage
- Clear session data on logout
- Validates session expiry status

## 📝 Configuration

All security parameters can be adjusted in `services/security.ts`:

```typescript
const MAX_ATTEMPTS = 5;                          // Max login attempts
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;    // 15 minutes lockout
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;     // 30 minutes timeout
const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
```

## 🔧 Integration Points

### AuthScreen.tsx
- Rate limiting check before login attempt
- CSRF token generation before request
- Error message showing lockout duration

### App.tsx
- Session timeout monitoring with activity detection
- Auto-logout on session expiry
- CSRF token generation for admin login

### api.ts
- loginUser() - includes csrfToken parameter
- loginAdmin() - includes csrfToken parameter

## ⚠️ Backend Requirements

Your Google Apps Script should:

1. **Validate CSRF Token**
   ```
   - Check if token exists and is not expired
   - Reject request if token invalid
   ```

2. **Implement Rate Limiting**
   ```
   - Track login attempts per IP/User
   - Return lockout message after 5 failed attempts
   ```

3. **Validate Input**
   ```
   - Sanitize all form inputs
   - Prevent SQL injection
   ```

## 🚀 Testing

To test the security features:

1. **Rate Limiting**: Try logging in with wrong password 5 times
   - Should see lockout message on 6th attempt
   - Wait 15 minutes or restart browser to reset

2. **Session Timeout**: Stay inactive for 30 minutes
   - Should auto-logout and show alert

3. **CSRF Token**: Tokens should be sent with every auth request
   - Check browser Network tab > Request Headers

## 📊 Session Storage

**Active Keys:**
- `LOGIN_ATTEMPTS` - Failed login tracking
- `CSRF_TOKEN` - Current CSRF token with expiry
- `SESSION_LAST_ACTIVITY` - Last activity timestamp
- `USER_SESSION_DATA` - User login session

## 🔐 Additional Recommendations

Still TODO (Medium Priority):
- [ ] Encrypt localStorage data using crypto-js
- [ ] Implement httpOnly cookies (requires backend changes)
- [ ] Add audit logging for all actions
- [ ] Enable Content Security Policy (CSP) headers

## 📞 Support

If you encounter issues:
1. Check browser console (F12) for error messages
2. Verify Google Apps Script is handling new CSRF/rate limit parameters
3. Check localStorage for session data: `localStorage.getItem('LOGIN_ATTEMPTS')`
