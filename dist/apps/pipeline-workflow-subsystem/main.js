/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PipelineWorkflowSubsystemModule = void 0;
const common_1 = __webpack_require__(3);
const pipeline_workflow_subsystem_controller_1 = __webpack_require__(4);
const pipeline_workflow_subsystem_service_1 = __webpack_require__(5);
let PipelineWorkflowSubsystemModule = class PipelineWorkflowSubsystemModule {
};
exports.PipelineWorkflowSubsystemModule = PipelineWorkflowSubsystemModule;
exports.PipelineWorkflowSubsystemModule = PipelineWorkflowSubsystemModule = __decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [pipeline_workflow_subsystem_controller_1.PipelineWorkflowSubsystemController],
        providers: [pipeline_workflow_subsystem_service_1.PipelineWorkflowSubsystemService],
    })
], PipelineWorkflowSubsystemModule);


/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PipelineWorkflowSubsystemController = void 0;
const common_1 = __webpack_require__(3);
const pipeline_workflow_subsystem_service_1 = __webpack_require__(5);
let PipelineWorkflowSubsystemController = class PipelineWorkflowSubsystemController {
    constructor(pipelineWorkflowSubsystemService) {
        this.pipelineWorkflowSubsystemService = pipelineWorkflowSubsystemService;
    }
    getHello() {
        return this.pipelineWorkflowSubsystemService.getHello();
    }
};
exports.PipelineWorkflowSubsystemController = PipelineWorkflowSubsystemController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], PipelineWorkflowSubsystemController.prototype, "getHello", null);
exports.PipelineWorkflowSubsystemController = PipelineWorkflowSubsystemController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [typeof (_a = typeof pipeline_workflow_subsystem_service_1.PipelineWorkflowSubsystemService !== "undefined" && pipeline_workflow_subsystem_service_1.PipelineWorkflowSubsystemService) === "function" ? _a : Object])
], PipelineWorkflowSubsystemController);


/***/ }),
/* 5 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PipelineWorkflowSubsystemService = void 0;
const common_1 = __webpack_require__(3);
let PipelineWorkflowSubsystemService = class PipelineWorkflowSubsystemService {
    getHello() {
        return 'Hello World!';
    }
};
exports.PipelineWorkflowSubsystemService = PipelineWorkflowSubsystemService;
exports.PipelineWorkflowSubsystemService = PipelineWorkflowSubsystemService = __decorate([
    (0, common_1.Injectable)()
], PipelineWorkflowSubsystemService);


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const core_1 = __webpack_require__(1);
const pipeline_workflow_subsystem_module_1 = __webpack_require__(2);
async function bootstrap() {
    const app = await core_1.NestFactory.create(pipeline_workflow_subsystem_module_1.PipelineWorkflowSubsystemModule);
    await app.listen(process.env.port ?? 3000);
}
bootstrap();

})();

/******/ })()
;