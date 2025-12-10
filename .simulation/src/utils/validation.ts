/**
 * Validation Utility
 *
 * Input validation functions for API requests and form data.
 */

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate an email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate a password meets requirements
 */
export function isValidPassword(password: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (password.length < 8) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters",
      code: "PASSWORD_TOO_SHORT",
    });
  }

  if (!/[A-Z]/.test(password)) {
    errors.push({
      field: "password",
      message: "Password must contain at least one uppercase letter",
      code: "PASSWORD_NO_UPPERCASE",
    });
  }

  if (!/[a-z]/.test(password)) {
    errors.push({
      field: "password",
      message: "Password must contain at least one lowercase letter",
      code: "PASSWORD_NO_LOWERCASE",
    });
  }

  if (!/\d/.test(password)) {
    errors.push({
      field: "password",
      message: "Password must contain at least one number",
      code: "PASSWORD_NO_NUMBER",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize a string by removing potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove angle brackets (XSS prevention)
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .trim();
}

/**
 * Validate a phone number (basic international format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{10,20}$/;
  return phoneRegex.test(phone);
}

/**
 * Generic object validator
 */
export function validateObject<T extends Record<string, unknown>>(
  obj: T,
  rules: Record<keyof T, ValidationRule>
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [field, rule] of Object.entries(rules) as [
    keyof T,
    ValidationRule
  ][]) {
    const value = obj[field];

    if (
      rule.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push({
        field: String(field),
        message: `${String(field)} is required`,
        code: "REQUIRED",
      });
      continue;
    }

    if (value !== undefined && value !== null) {
      if (rule.type === "email" && !isValidEmail(value as string)) {
        errors.push({
          field: String(field),
          message: "Invalid email format",
          code: "INVALID_EMAIL",
        });
      }

      if (rule.type === "string" && typeof value !== "string") {
        errors.push({
          field: String(field),
          message: `${String(field)} must be a string`,
          code: "INVALID_TYPE",
        });
      }

      if (
        rule.minLength &&
        typeof value === "string" &&
        value.length < rule.minLength
      ) {
        errors.push({
          field: String(field),
          message: `${String(field)} must be at least ${
            rule.minLength
          } characters`,
          code: "MIN_LENGTH",
        });
      }

      if (
        rule.maxLength &&
        typeof value === "string" &&
        value.length > rule.maxLength
      ) {
        errors.push({
          field: String(field),
          message: `${String(field)} must be at most ${
            rule.maxLength
          } characters`,
          code: "MAX_LENGTH",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

interface ValidationRule {
  required?: boolean;
  type?: "string" | "number" | "email" | "boolean";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}




