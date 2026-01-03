/**
 * Context Manager for LaunchDarkly Demo
 * 
 * Manages the current user context and handles transitions between
 * default context and user-provided context.
 */

// Default context configuration
const defaultContextConfig = {
    keyPrefix: 'default-user',
    nameTemplate: 'Default User',
    customAttributes: {
        source: 'backend-default',
        temporary: true
    }
};

class ContextManager {
    constructor() {
        this.currentUserContext = null;
        this.isUsingDefaultContext = false;
    }

    /**
     * Generate a default user context with unique key
     * @returns {Object} Default LaunchDarkly user context
     */
    generateDefaultContext() {
        const timestamp = Date.now();
        const randomComponent = Math.random().toString(36).substr(2, 8);
        const uniqueKey = `${defaultContextConfig.keyPrefix}-${timestamp}-${randomComponent}`;
        
        const defaultContext = {
            kind: "user",
            key: uniqueKey,
            name: `${defaultContextConfig.nameTemplate} (${uniqueKey.substring(0, 20)}...)`,
            custom: {
                ...defaultContextConfig.customAttributes,
                generatedAt: new Date().toISOString(),
                sessionId: `session-${timestamp}`
            }
        };
        
        console.log('🔧 Generated default user context:', defaultContext);
        return defaultContext;
    }

    /**
     * Get the current user context
     * If no context exists, generates and returns a default context
     * @returns {Object} Current LaunchDarkly user context
     */
    getCurrentContext() {
        if (!this.currentUserContext) {
            // Generate and use default context if no user context is available
            this.currentUserContext = this.generateDefaultContext();
            this.isUsingDefaultContext = true;
            console.log('🔧 Using default user context for LaunchDarkly operations');
        }
        return this.currentUserContext;
    }

    /**
     * Update the user context with provided user data
     * @param {string} userKey - Unique user identifier
     * @param {string} name - User display name (optional)
     * @returns {Object} Updated user context
     */
    updateContext(userKey, name) {
        // Validate userKey
        if (!userKey || typeof userKey !== 'string' || userKey.trim().length === 0) {
            throw new Error('userKey is required and must be a non-empty string');
        }

        // Use the exact name provided, or generate a fallback if none provided
        const contextName = name || `Full-stack User (${userKey.substring(0, 8)})`;
        
        const wasUsingDefault = this.isUsingDefaultContext;
        
        this.currentUserContext = {
            kind: "user",
            key: userKey,
            name: contextName
        };
        
        this.isUsingDefaultContext = false;
        
        if (wasUsingDefault) {
            console.log('🔄 Transitioned from default to provided user context:', this.currentUserContext);
        } else {
            console.log('🔄 User context updated:', this.currentUserContext);
        }
        
        return this.currentUserContext;
    }

    /**
     * Check if currently using default context
     * @returns {boolean} True if using default context, false otherwise
     */
    isUsingDefault() {
        return this.isUsingDefaultContext;
    }

    /**
     * Reset to default context
     * Useful for testing or when user logs out
     */
    resetToDefault() {
        const previousContext = this.currentUserContext;
        const wasUsingDefault = this.isUsingDefaultContext;
        
        this.currentUserContext = null;
        this.isUsingDefaultContext = false;
        
        // Log context reset for debugging
        console.log('🔄 Context reset to default');
        console.log(`   Previous context: ${previousContext ? previousContext.key : 'none'}`);
        console.log(`   Was using default: ${wasUsingDefault}`);
        console.log('   Next call to getCurrentContext() will generate a new default context');
        
        // Next call to getCurrentContext() will generate a new default context
    }

    /**
     * Get context transition information
     * @returns {Object} Information about current context state
     */
    getContextInfo() {
        return {
            context: this.getCurrentContext(),
            isUsingDefault: this.isUsingDefault(),
            message: this.isUsingDefault() 
                ? 'Using default context - ready for frontend context' 
                : 'Using provided user context'
        };
    }
}

module.exports = ContextManager;