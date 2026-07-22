"use strict";
/**
 * Stage 1A-1: 通用字段模式模块导出入口
 *
 * 职责：统一导出所有字段模式相关的类型和函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFieldDisplayLabel = exports.shouldGenerateDirectionEvaluation = exports.shouldAnalyzeField = exports.resolveFieldSchemas = exports.resolveFieldSchema = exports.mapNewRoleToLegacyAnalysisRole = exports.mapNewDataTypeToLegacyFieldType = exports.mapLegacyFieldMetasToSchemas = exports.mapLegacyFieldMetaToSchema = exports.mapLegacyAnalysisRoleToDirection = exports.mapLegacyAnalysisRoleToRole = exports.mapLegacyFieldTypeToDataType = exports.getEducationTemplateKeywords = exports.isEducationTemplateMatch = exports.applyEducationTemplate = exports.inferGenericFieldSchema = void 0;
// 通用推断
var inferGenericSchema_1 = require("./inferGenericSchema");
Object.defineProperty(exports, "inferGenericFieldSchema", { enumerable: true, get: function () { return inferGenericSchema_1.inferGenericFieldSchema; } });
// 教育模板
var education_1 = require("./templates/education");
Object.defineProperty(exports, "applyEducationTemplate", { enumerable: true, get: function () { return education_1.applyEducationTemplate; } });
Object.defineProperty(exports, "isEducationTemplateMatch", { enumerable: true, get: function () { return education_1.isEducationTemplateMatch; } });
Object.defineProperty(exports, "getEducationTemplateKeywords", { enumerable: true, get: function () { return education_1.getEducationTemplateKeywords; } });
// 旧模型兼容
var legacyAdapter_1 = require("./legacyAdapter");
Object.defineProperty(exports, "mapLegacyFieldTypeToDataType", { enumerable: true, get: function () { return legacyAdapter_1.mapLegacyFieldTypeToDataType; } });
Object.defineProperty(exports, "mapLegacyAnalysisRoleToRole", { enumerable: true, get: function () { return legacyAdapter_1.mapLegacyAnalysisRoleToRole; } });
Object.defineProperty(exports, "mapLegacyAnalysisRoleToDirection", { enumerable: true, get: function () { return legacyAdapter_1.mapLegacyAnalysisRoleToDirection; } });
Object.defineProperty(exports, "mapLegacyFieldMetaToSchema", { enumerable: true, get: function () { return legacyAdapter_1.mapLegacyFieldMetaToSchema; } });
Object.defineProperty(exports, "mapLegacyFieldMetasToSchemas", { enumerable: true, get: function () { return legacyAdapter_1.mapLegacyFieldMetasToSchemas; } });
Object.defineProperty(exports, "mapNewDataTypeToLegacyFieldType", { enumerable: true, get: function () { return legacyAdapter_1.mapNewDataTypeToLegacyFieldType; } });
Object.defineProperty(exports, "mapNewRoleToLegacyAnalysisRole", { enumerable: true, get: function () { return legacyAdapter_1.mapNewRoleToLegacyAnalysisRole; } });
// 优先级解析
var resolveFieldSchema_1 = require("./resolveFieldSchema");
Object.defineProperty(exports, "resolveFieldSchema", { enumerable: true, get: function () { return resolveFieldSchema_1.resolveFieldSchema; } });
Object.defineProperty(exports, "resolveFieldSchemas", { enumerable: true, get: function () { return resolveFieldSchema_1.resolveFieldSchemas; } });
Object.defineProperty(exports, "shouldAnalyzeField", { enumerable: true, get: function () { return resolveFieldSchema_1.shouldAnalyzeField; } });
Object.defineProperty(exports, "shouldGenerateDirectionEvaluation", { enumerable: true, get: function () { return resolveFieldSchema_1.shouldGenerateDirectionEvaluation; } });
Object.defineProperty(exports, "getFieldDisplayLabel", { enumerable: true, get: function () { return resolveFieldSchema_1.getFieldDisplayLabel; } });
