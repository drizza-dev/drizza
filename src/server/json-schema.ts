export interface SchemaIssue {
  path: string;
  message: string;
}

export type SchemaValidator = (value: unknown) => SchemaIssue[];

export const maxSchemaIssues = 50;
const maxEchoedKeyLength = 64;

type SchemaObject = Record<string, unknown>;

const supportedKeywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "const",
  "enum",
  "pattern",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "title",
  "description",
]);

const supportedTypes = new Set(["object", "array", "string", "integer", "number", "boolean", "null"]);

export function compileSchema(schema: unknown): SchemaValidator {
  const patterns = new Map<string, RegExp>();
  checkSchema(schema, "#", patterns);
  return (value) => {
    const issues: SchemaIssue[] = [];
    validate(schema as SchemaObject, value, "", issues, patterns);
    return issues;
  };
}

function checkSchema(schema: unknown, location: string, patterns: Map<string, RegExp>): void {
  if (!isObject(schema)) throw new Error(`Schema at ${location} must be an object.`);

  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) throw new Error(`Unsupported schema keyword "${keyword}" at ${location}.`);
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];

  for (const type of types) {
    if (typeof type !== "string" || !supportedTypes.has(type)) {
      throw new Error(`Unsupported schema type at ${location}.`);
    }
  }

  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    throw new Error(`Only "additionalProperties": false is supported at ${location}.`);
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string")) {
      throw new Error(`"required" must be a list of names at ${location}.`);
    }
  }

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    throw new Error(`"enum" must be a list at ${location}.`);
  }

  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems"]) {
    const bound = schema[keyword];
    if (bound !== undefined && (!Number.isInteger(bound) || (bound as number) < 0)) {
      throw new Error(`"${keyword}" must be a non-negative integer at ${location}.`);
    }
  }

  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string") throw new Error(`"pattern" must be a string at ${location}.`);
    patterns.set(schema.pattern, new RegExp(schema.pattern, "u"));
  }

  if (schema.properties !== undefined) {
    if (!isObject(schema.properties)) throw new Error(`"properties" must be an object at ${location}.`);
    for (const [name, child] of Object.entries(schema.properties)) {
      checkSchema(child, `${location}/properties/${name}`, patterns);
    }
  }

  if (schema.items !== undefined) checkSchema(schema.items, `${location}/items`, patterns);
}

function validate(
  schema: SchemaObject,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
  patterns: Map<string, RegExp>,
): void {
  if (issues.length > maxSchemaIssues) return;

  const at = path || "/";

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((type) => matchesType(type, value))) {
      issues.push({ path: at, message: `must be ${types.join(" or ")}` });
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path: at, message: `must be ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    issues.push({ path: at, message: `must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}` });
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      issues.push({ path: at, message: `must have at least ${schema.minLength} characters` });
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      issues.push({ path: at, message: `must have at most ${schema.maxLength} characters` });
    }
    if (typeof schema.pattern === "string" && !patterns.get(schema.pattern)?.test(value)) {
      issues.push({ path: at, message: `must match ${schema.pattern}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push({ path: at, message: `must have at least ${schema.minItems} items` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push({ path: at, message: `must have at most ${schema.maxItems} items` });
      return;
    }
    if (isObject(schema.items)) {
      for (let index = 0; index < value.length && issues.length <= maxSchemaIssues; index += 1) {
        validate(schema.items as SchemaObject, value[index], `${path}/${index}`, issues, patterns);
      }
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};

    for (const name of (schema.required as string[] | undefined) ?? []) {
      if (!Object.hasOwn(value, name)) issues.push({ path: `${path}/${escapePointer(name)}`, message: "is required" });
    }

    for (const [name, child] of Object.entries(value)) {
      if (issues.length > maxSchemaIssues) break;
      const childSchema = Object.hasOwn(properties, name) ? properties[name] : undefined;
      if (isObject(childSchema)) {
        validate(childSchema, child, `${path}/${escapePointer(name)}`, issues, patterns);
      } else if (schema.additionalProperties === false) {
        issues.push({ path: `${path}/${escapePointer(truncateKey(name))}`, message: "is not allowed" });
      }
    }
  }
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function truncateKey(name: string): string {
  const codePoints = [...name];
  return codePoints.length > maxEchoedKeyLength ? `${codePoints.slice(0, maxEchoedKeyLength).join("")}...` : name;
}

function escapePointer(name: string): string {
  return name.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
