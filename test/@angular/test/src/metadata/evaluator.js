/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define("@angular/compiler-cli/src/metadata/evaluator", ["require", "exports", "tslib", "typescript", "@angular/compiler-cli/src/metadata/schema"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = require("tslib");
    var ts = require("typescript");
    var schema_1 = require("@angular/compiler-cli/src/metadata/schema");
    // In TypeScript 2.1 the spread element kind was renamed.
    var spreadElementSyntaxKind = ts.SyntaxKind.SpreadElement || ts.SyntaxKind.SpreadElementExpression;
    function isMethodCallOf(callExpression, memberName) {
        var expression = callExpression.expression;
        if (expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            var propertyAccessExpression = expression;
            var name = propertyAccessExpression.name;
            if (name.kind == ts.SyntaxKind.Identifier) {
                return name.text === memberName;
            }
        }
        return false;
    }
    function isCallOf(callExpression, ident) {
        var expression = callExpression.expression;
        if (expression.kind === ts.SyntaxKind.Identifier) {
            var identifier = expression;
            return identifier.text === ident;
        }
        return false;
    }
    /* @internal */
    function recordMapEntry(entry, node, nodeMap, sourceFile) {
        if (!nodeMap.has(entry)) {
            nodeMap.set(entry, node);
            if (node && (schema_1.isMetadataImportedSymbolReferenceExpression(entry) ||
                schema_1.isMetadataImportDefaultReference(entry)) &&
                entry.line == null) {
                var info = sourceInfo(node, sourceFile);
                if (info.line != null)
                    entry.line = info.line;
                if (info.character != null)
                    entry.character = info.character;
            }
        }
        return entry;
    }
    exports.recordMapEntry = recordMapEntry;
    /**
     * ts.forEachChild stops iterating children when the callback return a truthy value.
     * This method inverts this to implement an `every` style iterator. It will return
     * true if every call to `cb` returns `true`.
     */
    function everyNodeChild(node, cb) {
        return !ts.forEachChild(node, function (node) { return !cb(node); });
    }
    function isPrimitive(value) {
        return Object(value) !== value;
    }
    exports.isPrimitive = isPrimitive;
    function isDefined(obj) {
        return obj !== undefined;
    }
    function getSourceFileOfNode(node) {
        while (node && node.kind != ts.SyntaxKind.SourceFile) {
            node = node.parent;
        }
        return node;
    }
    /* @internal */
    function sourceInfo(node, sourceFile) {
        if (node) {
            sourceFile = sourceFile || getSourceFileOfNode(node);
            if (sourceFile) {
                return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
            }
        }
        return {};
    }
    exports.sourceInfo = sourceInfo;
    /* @internal */
    function errorSymbol(message, node, context, sourceFile) {
        var result = tslib_1.__assign({ __symbolic: 'error', message: message }, sourceInfo(node, sourceFile));
        if (context) {
            result.context = context;
        }
        return result;
    }
    exports.errorSymbol = errorSymbol;
    /**
     * Produce a symbolic representation of an expression folding values into their final value when
     * possible.
     */
    var Evaluator = /** @class */ (function () {
        function Evaluator(symbols, nodeMap, options, recordExport) {
            if (options === void 0) { options = {}; }
            this.symbols = symbols;
            this.nodeMap = nodeMap;
            this.options = options;
            this.recordExport = recordExport;
        }
        Evaluator.prototype.nameOf = function (node) {
            if (node && node.kind == ts.SyntaxKind.Identifier) {
                return node.text;
            }
            var result = node && this.evaluateNode(node);
            if (schema_1.isMetadataError(result) || typeof result === 'string') {
                return result;
            }
            else {
                return errorSymbol('Name expected', node, { received: (node && node.getText()) || '<missing>' });
            }
        };
        /**
         * Returns true if the expression represented by `node` can be folded into a literal expression.
         *
         * For example, a literal is always foldable. This means that literal expressions such as `1.2`
         * `"Some value"` `true` `false` are foldable.
         *
         * - An object literal is foldable if all the properties in the literal are foldable.
         * - An array literal is foldable if all the elements are foldable.
         * - A call is foldable if it is a call to a Array.prototype.concat or a call to CONST_EXPR.
         * - A property access is foldable if the object is foldable.
         * - A array index is foldable if index expression is foldable and the array is foldable.
         * - Binary operator expressions are foldable if the left and right expressions are foldable and
         *   it is one of '+', '-', '*', '/', '%', '||', and '&&'.
         * - An identifier is foldable if a value can be found for its symbol in the evaluator symbol
         *   table.
         */
        Evaluator.prototype.isFoldable = function (node) {
            return this.isFoldableWorker(node, new Map());
        };
        Evaluator.prototype.isFoldableWorker = function (node, folding) {
            var _this = this;
            if (node) {
                switch (node.kind) {
                    case ts.SyntaxKind.ObjectLiteralExpression:
                        return everyNodeChild(node, function (child) {
                            if (child.kind === ts.SyntaxKind.PropertyAssignment) {
                                var propertyAssignment = child;
                                return _this.isFoldableWorker(propertyAssignment.initializer, folding);
                            }
                            return false;
                        });
                    case ts.SyntaxKind.ArrayLiteralExpression:
                        return everyNodeChild(node, function (child) { return _this.isFoldableWorker(child, folding); });
                    case ts.SyntaxKind.CallExpression:
                        var callExpression = node;
                        // We can fold a <array>.concat(<v>).
                        if (isMethodCallOf(callExpression, 'concat') &&
                            arrayOrEmpty(callExpression.arguments).length === 1) {
                            var arrayNode = callExpression.expression.expression;
                            if (this.isFoldableWorker(arrayNode, folding) &&
                                this.isFoldableWorker(callExpression.arguments[0], folding)) {
                                // It needs to be an array.
                                var arrayValue = this.evaluateNode(arrayNode);
                                if (arrayValue && Array.isArray(arrayValue)) {
                                    return true;
                                }
                            }
                        }
                        // We can fold a call to CONST_EXPR
                        if (isCallOf(callExpression, 'CONST_EXPR') &&
                            arrayOrEmpty(callExpression.arguments).length === 1)
                            return this.isFoldableWorker(callExpression.arguments[0], folding);
                        return false;
                    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
                    case ts.SyntaxKind.StringLiteral:
                    case ts.SyntaxKind.NumericLiteral:
                    case ts.SyntaxKind.NullKeyword:
                    case ts.SyntaxKind.TrueKeyword:
                    case ts.SyntaxKind.FalseKeyword:
                    case ts.SyntaxKind.TemplateHead:
                    case ts.SyntaxKind.TemplateMiddle:
                    case ts.SyntaxKind.TemplateTail:
                        return true;
                    case ts.SyntaxKind.ParenthesizedExpression:
                        var parenthesizedExpression = node;
                        return this.isFoldableWorker(parenthesizedExpression.expression, folding);
                    case ts.SyntaxKind.BinaryExpression:
                        var binaryExpression = node;
                        switch (binaryExpression.operatorToken.kind) {
                            case ts.SyntaxKind.PlusToken:
                            case ts.SyntaxKind.MinusToken:
                            case ts.SyntaxKind.AsteriskToken:
                            case ts.SyntaxKind.SlashToken:
                            case ts.SyntaxKind.PercentToken:
                            case ts.SyntaxKind.AmpersandAmpersandToken:
                            case ts.SyntaxKind.BarBarToken:
                                return this.isFoldableWorker(binaryExpression.left, folding) &&
                                    this.isFoldableWorker(binaryExpression.right, folding);
                            default:
                                return false;
                        }
                    case ts.SyntaxKind.PropertyAccessExpression:
                        var propertyAccessExpression = node;
                        return this.isFoldableWorker(propertyAccessExpression.expression, folding);
                    case ts.SyntaxKind.ElementAccessExpression:
                        var elementAccessExpression = node;
                        return this.isFoldableWorker(elementAccessExpression.expression, folding) &&
                            this.isFoldableWorker(elementAccessExpression.argumentExpression, folding);
                    case ts.SyntaxKind.Identifier:
                        var identifier = node;
                        var reference = this.symbols.resolve(identifier.text);
                        if (reference !== undefined && isPrimitive(reference)) {
                            return true;
                        }
                        break;
                    case ts.SyntaxKind.TemplateExpression:
                        var templateExpression = node;
                        return templateExpression.templateSpans.every(function (span) { return _this.isFoldableWorker(span.expression, folding); });
                }
            }
            return false;
        };
        /**
         * Produce a JSON serialiable object representing `node`. The foldable values in the expression
         * tree are folded. For example, a node representing `1 + 2` is folded into `3`.
         */
        Evaluator.prototype.evaluateNode = function (node, preferReference) {
            var _this = this;
            var t = this;
            var error;
            function recordEntry(entry, node) {
                if (t.options.substituteExpression) {
                    var newEntry = t.options.substituteExpression(entry, node);
                    if (t.recordExport && newEntry != entry && schema_1.isMetadataGlobalReferenceExpression(newEntry)) {
                        t.recordExport(newEntry.name, entry);
                    }
                    entry = newEntry;
                }
                return recordMapEntry(entry, node, t.nodeMap);
            }
            function isFoldableError(value) {
                return !t.options.verboseInvalidExpression && schema_1.isMetadataError(value);
            }
            var resolveName = function (name, preferReference) {
                var reference = _this.symbols.resolve(name, preferReference);
                if (reference === undefined) {
                    // Encode as a global reference. StaticReflector will check the reference.
                    return recordEntry({ __symbolic: 'reference', name: name }, node);
                }
                if (reference && schema_1.isMetadataSymbolicReferenceExpression(reference)) {
                    return recordEntry(tslib_1.__assign({}, reference), node);
                }
                return reference;
            };
            switch (node.kind) {
                case ts.SyntaxKind.ObjectLiteralExpression:
                    var obj_1 = {};
                    var quoted_1 = [];
                    ts.forEachChild(node, function (child) {
                        switch (child.kind) {
                            case ts.SyntaxKind.ShorthandPropertyAssignment:
                            case ts.SyntaxKind.PropertyAssignment:
                                var assignment = child;
                                if (assignment.name.kind == ts.SyntaxKind.StringLiteral) {
                                    var name_1 = assignment.name.text;
                                    quoted_1.push(name_1);
                                }
                                var propertyName = _this.nameOf(assignment.name);
                                if (isFoldableError(propertyName)) {
                                    error = propertyName;
                                    return true;
                                }
                                var propertyValue = isPropertyAssignment(assignment) ?
                                    _this.evaluateNode(assignment.initializer, /* preferReference */ true) :
                                    resolveName(propertyName, /* preferReference */ true);
                                if (isFoldableError(propertyValue)) {
                                    error = propertyValue;
                                    return true; // Stop the forEachChild.
                                }
                                else {
                                    obj_1[propertyName] = isPropertyAssignment(assignment) ?
                                        recordEntry(propertyValue, assignment.initializer) :
                                        propertyValue;
                                }
                        }
                    });
                    if (error)
                        return error;
                    if (this.options.quotedNames && quoted_1.length) {
                        obj_1['$quoted$'] = quoted_1;
                    }
                    return recordEntry(obj_1, node);
                case ts.SyntaxKind.ArrayLiteralExpression:
                    var arr_1 = [];
                    ts.forEachChild(node, function (child) {
                        var e_1, _a;
                        var value = _this.evaluateNode(child, /* preferReference */ true);
                        // Check for error
                        if (isFoldableError(value)) {
                            error = value;
                            return true; // Stop the forEachChild.
                        }
                        // Handle spread expressions
                        if (schema_1.isMetadataSymbolicSpreadExpression(value)) {
                            if (Array.isArray(value.expression)) {
                                try {
                                    for (var _b = tslib_1.__values(value.expression), _c = _b.next(); !_c.done; _c = _b.next()) {
                                        var spreadValue = _c.value;
                                        arr_1.push(spreadValue);
                                    }
                                }
                                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                                finally {
                                    try {
                                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                                    }
                                    finally { if (e_1) throw e_1.error; }
                                }
                                return;
                            }
                        }
                        arr_1.push(value);
                    });
                    if (error)
                        return error;
                    return recordEntry(arr_1, node);
                case spreadElementSyntaxKind:
                    var spreadExpression = this.evaluateNode(node.expression);
                    return recordEntry({ __symbolic: 'spread', expression: spreadExpression }, node);
                case ts.SyntaxKind.CallExpression:
                    var callExpression = node;
                    if (isCallOf(callExpression, 'forwardRef') &&
                        arrayOrEmpty(callExpression.arguments).length === 1) {
                        var firstArgument = callExpression.arguments[0];
                        if (firstArgument.kind == ts.SyntaxKind.ArrowFunction) {
                            var arrowFunction = firstArgument;
                            return recordEntry(this.evaluateNode(arrowFunction.body), node);
                        }
                    }
                    var args = arrayOrEmpty(callExpression.arguments).map(function (arg) { return _this.evaluateNode(arg); });
                    if (this.isFoldable(callExpression)) {
                        if (isMethodCallOf(callExpression, 'concat')) {
                            var arrayValue = this.evaluateNode(callExpression.expression.expression);
                            if (isFoldableError(arrayValue))
                                return arrayValue;
                            return arrayValue.concat(args[0]);
                        }
                    }
                    // Always fold a CONST_EXPR even if the argument is not foldable.
                    if (isCallOf(callExpression, 'CONST_EXPR') &&
                        arrayOrEmpty(callExpression.arguments).length === 1) {
                        return recordEntry(args[0], node);
                    }
                    var expression = this.evaluateNode(callExpression.expression);
                    if (isFoldableError(expression)) {
                        return recordEntry(expression, node);
                    }
                    var result = { __symbolic: 'call', expression: expression };
                    if (args && args.length) {
                        result.arguments = args;
                    }
                    return recordEntry(result, node);
                case ts.SyntaxKind.NewExpression:
                    var newExpression = node;
                    var newArgs = arrayOrEmpty(newExpression.arguments).map(function (arg) { return _this.evaluateNode(arg); });
                    var newTarget = this.evaluateNode(newExpression.expression);
                    if (schema_1.isMetadataError(newTarget)) {
                        return recordEntry(newTarget, node);
                    }
                    var call = { __symbolic: 'new', expression: newTarget };
                    if (newArgs.length) {
                        call.arguments = newArgs;
                    }
                    return recordEntry(call, node);
                case ts.SyntaxKind.PropertyAccessExpression: {
                    var propertyAccessExpression = node;
                    var expression_1 = this.evaluateNode(propertyAccessExpression.expression);
                    if (isFoldableError(expression_1)) {
                        return recordEntry(expression_1, node);
                    }
                    var member = this.nameOf(propertyAccessExpression.name);
                    if (isFoldableError(member)) {
                        return recordEntry(member, node);
                    }
                    if (expression_1 && this.isFoldable(propertyAccessExpression.expression))
                        return expression_1[member];
                    if (schema_1.isMetadataModuleReferenceExpression(expression_1)) {
                        // A select into a module reference and be converted into a reference to the symbol
                        // in the module
                        return recordEntry({ __symbolic: 'reference', module: expression_1.module, name: member }, node);
                    }
                    return recordEntry({ __symbolic: 'select', expression: expression_1, member: member }, node);
                }
                case ts.SyntaxKind.ElementAccessExpression: {
                    var elementAccessExpression = node;
                    var expression_2 = this.evaluateNode(elementAccessExpression.expression);
                    if (isFoldableError(expression_2)) {
                        return recordEntry(expression_2, node);
                    }
                    if (!elementAccessExpression.argumentExpression) {
                        return recordEntry(errorSymbol('Expression form not supported', node), node);
                    }
                    var index = this.evaluateNode(elementAccessExpression.argumentExpression);
                    if (isFoldableError(expression_2)) {
                        return recordEntry(expression_2, node);
                    }
                    if (this.isFoldable(elementAccessExpression.expression) &&
                        this.isFoldable(elementAccessExpression.argumentExpression))
                        return expression_2[index];
                    return recordEntry({ __symbolic: 'index', expression: expression_2, index: index }, node);
                }
                case ts.SyntaxKind.Identifier:
                    var identifier = node;
                    var name = identifier.text;
                    return resolveName(name, preferReference);
                case ts.SyntaxKind.TypeReference:
                    var typeReferenceNode = node;
                    var typeNameNode_1 = typeReferenceNode.typeName;
                    var getReference = function (node) {
                        if (typeNameNode_1.kind === ts.SyntaxKind.QualifiedName) {
                            var qualifiedName = node;
                            var left_1 = _this.evaluateNode(qualifiedName.left);
                            if (schema_1.isMetadataModuleReferenceExpression(left_1)) {
                                return recordEntry({
                                    __symbolic: 'reference',
                                    module: left_1.module,
                                    name: qualifiedName.right.text
                                }, node);
                            }
                            // Record a type reference to a declared type as a select.
                            return { __symbolic: 'select', expression: left_1, member: qualifiedName.right.text };
                        }
                        else {
                            var identifier_1 = typeNameNode_1;
                            var symbol = _this.symbols.resolve(identifier_1.text);
                            if (isFoldableError(symbol) || schema_1.isMetadataSymbolicReferenceExpression(symbol)) {
                                return recordEntry(symbol, node);
                            }
                            return recordEntry(errorSymbol('Could not resolve type', node, { typeName: identifier_1.text }), node);
                        }
                    };
                    var typeReference = getReference(typeNameNode_1);
                    if (isFoldableError(typeReference)) {
                        return recordEntry(typeReference, node);
                    }
                    if (!schema_1.isMetadataModuleReferenceExpression(typeReference) &&
                        typeReferenceNode.typeArguments && typeReferenceNode.typeArguments.length) {
                        var args_1 = typeReferenceNode.typeArguments.map(function (element) { return _this.evaluateNode(element); });
                        // TODO: Remove typecast when upgraded to 2.0 as it will be correctly inferred.
                        // Some versions of 1.9 do not infer this correctly.
                        typeReference.arguments = args_1;
                    }
                    return recordEntry(typeReference, node);
                case ts.SyntaxKind.UnionType:
                    var unionType_1 = node;
                    // Remove null and undefined from the list of unions.
                    var references = unionType_1.types
                        .filter(function (n) { return n.kind != ts.SyntaxKind.NullKeyword &&
                        n.kind != ts.SyntaxKind.UndefinedKeyword; })
                        .map(function (n) { return _this.evaluateNode(n); });
                    // The remmaining reference must be the same. If two have type arguments consider them
                    // different even if the type arguments are the same.
                    var candidate = null;
                    for (var i = 0; i < references.length; i++) {
                        var reference = references[i];
                        if (schema_1.isMetadataSymbolicReferenceExpression(reference)) {
                            if (candidate) {
                                if (reference.name == candidate.name &&
                                    reference.module == candidate.module && !reference.arguments) {
                                    candidate = reference;
                                }
                            }
                            else {
                                candidate = reference;
                            }
                        }
                        else {
                            return reference;
                        }
                    }
                    if (candidate)
                        return candidate;
                    break;
                case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
                case ts.SyntaxKind.StringLiteral:
                case ts.SyntaxKind.TemplateHead:
                case ts.SyntaxKind.TemplateTail:
                case ts.SyntaxKind.TemplateMiddle:
                    return node.text;
                case ts.SyntaxKind.NumericLiteral:
                    return parseFloat(node.text);
                case ts.SyntaxKind.AnyKeyword:
                    return recordEntry({ __symbolic: 'reference', name: 'any' }, node);
                case ts.SyntaxKind.StringKeyword:
                    return recordEntry({ __symbolic: 'reference', name: 'string' }, node);
                case ts.SyntaxKind.NumberKeyword:
                    return recordEntry({ __symbolic: 'reference', name: 'number' }, node);
                case ts.SyntaxKind.BooleanKeyword:
                    return recordEntry({ __symbolic: 'reference', name: 'boolean' }, node);
                case ts.SyntaxKind.ArrayType:
                    var arrayTypeNode = node;
                    return recordEntry({
                        __symbolic: 'reference',
                        name: 'Array',
                        arguments: [this.evaluateNode(arrayTypeNode.elementType)]
                    }, node);
                case ts.SyntaxKind.NullKeyword:
                    return null;
                case ts.SyntaxKind.TrueKeyword:
                    return true;
                case ts.SyntaxKind.FalseKeyword:
                    return false;
                case ts.SyntaxKind.ParenthesizedExpression:
                    var parenthesizedExpression = node;
                    return this.evaluateNode(parenthesizedExpression.expression);
                case ts.SyntaxKind.TypeAssertionExpression:
                    var typeAssertion = node;
                    return this.evaluateNode(typeAssertion.expression);
                case ts.SyntaxKind.PrefixUnaryExpression:
                    var prefixUnaryExpression = node;
                    var operand = this.evaluateNode(prefixUnaryExpression.operand);
                    if (isDefined(operand) && isPrimitive(operand)) {
                        switch (prefixUnaryExpression.operator) {
                            case ts.SyntaxKind.PlusToken:
                                return +operand;
                            case ts.SyntaxKind.MinusToken:
                                return -operand;
                            case ts.SyntaxKind.TildeToken:
                                return ~operand;
                            case ts.SyntaxKind.ExclamationToken:
                                return !operand;
                        }
                    }
                    var operatorText = void 0;
                    switch (prefixUnaryExpression.operator) {
                        case ts.SyntaxKind.PlusToken:
                            operatorText = '+';
                            break;
                        case ts.SyntaxKind.MinusToken:
                            operatorText = '-';
                            break;
                        case ts.SyntaxKind.TildeToken:
                            operatorText = '~';
                            break;
                        case ts.SyntaxKind.ExclamationToken:
                            operatorText = '!';
                            break;
                        default:
                            return undefined;
                    }
                    return recordEntry({ __symbolic: 'pre', operator: operatorText, operand: operand }, node);
                case ts.SyntaxKind.BinaryExpression:
                    var binaryExpression = node;
                    var left = this.evaluateNode(binaryExpression.left);
                    var right = this.evaluateNode(binaryExpression.right);
                    if (isDefined(left) && isDefined(right)) {
                        if (isPrimitive(left) && isPrimitive(right))
                            switch (binaryExpression.operatorToken.kind) {
                                case ts.SyntaxKind.BarBarToken:
                                    return left || right;
                                case ts.SyntaxKind.AmpersandAmpersandToken:
                                    return left && right;
                                case ts.SyntaxKind.AmpersandToken:
                                    return left & right;
                                case ts.SyntaxKind.BarToken:
                                    return left | right;
                                case ts.SyntaxKind.CaretToken:
                                    return left ^ right;
                                case ts.SyntaxKind.EqualsEqualsToken:
                                    return left == right;
                                case ts.SyntaxKind.ExclamationEqualsToken:
                                    return left != right;
                                case ts.SyntaxKind.EqualsEqualsEqualsToken:
                                    return left === right;
                                case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                                    return left !== right;
                                case ts.SyntaxKind.LessThanToken:
                                    return left < right;
                                case ts.SyntaxKind.GreaterThanToken:
                                    return left > right;
                                case ts.SyntaxKind.LessThanEqualsToken:
                                    return left <= right;
                                case ts.SyntaxKind.GreaterThanEqualsToken:
                                    return left >= right;
                                case ts.SyntaxKind.LessThanLessThanToken:
                                    return left << right;
                                case ts.SyntaxKind.GreaterThanGreaterThanToken:
                                    return left >> right;
                                case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
                                    return left >>> right;
                                case ts.SyntaxKind.PlusToken:
                                    return left + right;
                                case ts.SyntaxKind.MinusToken:
                                    return left - right;
                                case ts.SyntaxKind.AsteriskToken:
                                    return left * right;
                                case ts.SyntaxKind.SlashToken:
                                    return left / right;
                                case ts.SyntaxKind.PercentToken:
                                    return left % right;
                            }
                        return recordEntry({
                            __symbolic: 'binop',
                            operator: binaryExpression.operatorToken.getText(),
                            left: left,
                            right: right
                        }, node);
                    }
                    break;
                case ts.SyntaxKind.ConditionalExpression:
                    var conditionalExpression = node;
                    var condition = this.evaluateNode(conditionalExpression.condition);
                    var thenExpression = this.evaluateNode(conditionalExpression.whenTrue);
                    var elseExpression = this.evaluateNode(conditionalExpression.whenFalse);
                    if (isPrimitive(condition)) {
                        return condition ? thenExpression : elseExpression;
                    }
                    return recordEntry({ __symbolic: 'if', condition: condition, thenExpression: thenExpression, elseExpression: elseExpression }, node);
                case ts.SyntaxKind.FunctionExpression:
                case ts.SyntaxKind.ArrowFunction:
                    return recordEntry(errorSymbol('Lambda not supported', node), node);
                case ts.SyntaxKind.TaggedTemplateExpression:
                    return recordEntry(errorSymbol('Tagged template expressions are not supported in metadata', node), node);
                case ts.SyntaxKind.TemplateExpression:
                    var templateExpression = node;
                    if (this.isFoldable(node)) {
                        return templateExpression.templateSpans.reduce(function (previous, current) { return previous + _this.evaluateNode(current.expression) +
                            _this.evaluateNode(current.literal); }, this.evaluateNode(templateExpression.head));
                    }
                    else {
                        return templateExpression.templateSpans.reduce(function (previous, current) {
                            var expr = _this.evaluateNode(current.expression);
                            var literal = _this.evaluateNode(current.literal);
                            if (isFoldableError(expr))
                                return expr;
                            if (isFoldableError(literal))
                                return literal;
                            if (typeof previous === 'string' && typeof expr === 'string' &&
                                typeof literal === 'string') {
                                return previous + expr + literal;
                            }
                            var result = expr;
                            if (previous !== '') {
                                result = { __symbolic: 'binop', operator: '+', left: previous, right: expr };
                            }
                            if (literal != '') {
                                result = { __symbolic: 'binop', operator: '+', left: result, right: literal };
                            }
                            return result;
                        }, this.evaluateNode(templateExpression.head));
                    }
                case ts.SyntaxKind.AsExpression:
                    var asExpression = node;
                    return this.evaluateNode(asExpression.expression);
                case ts.SyntaxKind.ClassExpression:
                    return { __symbolic: 'class' };
            }
            return recordEntry(errorSymbol('Expression form not supported', node), node);
        };
        return Evaluator;
    }());
    exports.Evaluator = Evaluator;
    function isPropertyAssignment(node) {
        return node.kind == ts.SyntaxKind.PropertyAssignment;
    }
    var empty = ts.createNodeArray();
    function arrayOrEmpty(v) {
        return v || empty;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZhbHVhdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXItY2xpL3NyYy9tZXRhZGF0YS9ldmFsdWF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7O0lBRUgsK0JBQWlDO0lBR2pDLG9FQUFxZDtJQUtyZCx5REFBeUQ7SUFDekQsSUFBTSx1QkFBdUIsR0FDeEIsRUFBRSxDQUFDLFVBQWtCLENBQUMsYUFBYSxJQUFLLEVBQUUsQ0FBQyxVQUFrQixDQUFDLHVCQUF1QixDQUFDO0lBRTNGLFNBQVMsY0FBYyxDQUFDLGNBQWlDLEVBQUUsVUFBa0I7UUFDM0UsSUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQztRQUM3QyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsRUFBRTtZQUM5RCxJQUFNLHdCQUF3QixHQUFnQyxVQUFVLENBQUM7WUFDekUsSUFBTSxJQUFJLEdBQUcsd0JBQXdCLENBQUMsSUFBSSxDQUFDO1lBQzNDLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRTtnQkFDekMsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQzthQUNqQztTQUNGO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQsU0FBUyxRQUFRLENBQUMsY0FBaUMsRUFBRSxLQUFhO1FBQ2hFLElBQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUM7UUFDN0MsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFO1lBQ2hELElBQU0sVUFBVSxHQUFrQixVQUFVLENBQUM7WUFDN0MsT0FBTyxVQUFVLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQztTQUNsQztRQUNELE9BQU8s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QyxVQUFVLENBQUMsWUFBWTtvQkFDN0IsSUFBTSxZQUFZLEdBQW9CLElBQUksQ0FBQztvQkFDM0MsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDcEQsS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLGVBQWU7b0JBQ2hDLE9BQU8sRUFBQyxVQUFVLEVBQUUsT0FBTyxFQUFDLENBQUM7YUFDaEM7WUFDRCxPQUFPLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0UsQ0FBQztRQUNILGdCQUFDO0lBQUQsQ0FBQyxBQWpqQkQsSUFpakJDO0lBampCWSw4QkFBUztJQW1qQnRCLFNBQVMsb0JBQW9CLENBQUMsSUFBYTtRQUN6QyxPQUFPLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQztJQUN2RCxDQUFDO0lBRUQsSUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDLGVBQWUsRUFBTyxDQUFDO0lBRXhDLFNBQVMsWUFBWSxDQUFvQixDQUE2QjtRQUNwRSxPQUFPLENBQUMsSUFBSSxLQUFLLENBQUM7SUFDcEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmltcG9ydCB7Q29sbGVjdG9yT3B0aW9uc30gZnJvbSAnLi9jb2xsZWN0b3InO1xuaW1wb3J0IHtDbGFzc01ldGFkYXRhLCBGdW5jdGlvbk1ldGFkYXRhLCBJbnRlcmZhY2VNZXRhZGF0YSwgTWV0YWRhdGFFbnRyeSwgTWV0YWRhdGFFcnJvciwgTWV0YWRhdGFJbXBvcnRlZFN5bWJvbFJlZmVyZW5jZUV4cHJlc3Npb24sIE1ldGFkYXRhU291cmNlTG9jYXRpb25JbmZvLCBNZXRhZGF0YVN5bWJvbGljQ2FsbEV4cHJlc3Npb24sIE1ldGFkYXRhVmFsdWUsIGlzTWV0YWRhdGFFcnJvciwgaXNNZXRhZGF0YUdsb2JhbFJlZmVyZW5jZUV4cHJlc3Npb24sIGlzTWV0YWRhdGFJbXBvcnREZWZhdWx0UmVmZXJlbmNlLCBpc01ldGFkYXRhSW1wb3J0ZWRTeW1ib2xSZWZlcmVuY2VFeHByZXNzaW9uLCBpc01ldGFkYXRhTW9kdWxlUmVmZXJlbmNlRXhwcmVzc2lvbiwgaXNNZXRhZGF0YVN5bWJvbGljUmVmZXJlbmNlRXhwcmVzc2lvbiwgaXNNZXRhZGF0YVN5bWJvbGljU3ByZWFkRXhwcmVzc2lvbn0gZnJvbSAnLi9zY2hlbWEnO1xuaW1wb3J0IHtTeW1ib2xzfSBmcm9tICcuL3N5bWJvbHMnO1xuXG5cblxuLy8gSW4gVHlwZVNjcmlwdCAyLjEgdGhlIHNwcmVhZCBlbGVtZW50IGtpbmQgd2FzIHJlbmFtZWQuXG5jb25zdCBzcHJlYWRFbGVtZW50U3ludGF4S2luZDogdHMuU3ludGF4S2luZCA9XG4gICAgKHRzLlN5bnRheEtpbmQgYXMgYW55KS5TcHJlYWRFbGVtZW50IHx8ICh0cy5TeW50YXhLaW5kIGFzIGFueSkuU3ByZWFkRWxlbWVudEV4cHJlc3Npb247XG5cbmZ1bmN0aW9uIGlzTWV0aG9kQ2FsbE9mKGNhbGxFeHByZXNzaW9uOiB0cy5DYWxsRXhwcmVzc2lvbiwgbWVtYmVyTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGV4cHJlc3Npb24gPSBjYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBpZiAoZXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbikge1xuICAgIGNvbnN0IHByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiA9IDx0cy5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24+ZXhwcmVzc2lvbjtcbiAgICBjb25zdCBuYW1lID0gcHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uLm5hbWU7XG4gICAgaWYgKG5hbWUua2luZCA9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICAgIHJldHVybiBuYW1lLnRleHQgPT09IG1lbWJlck5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNDYWxsT2YoY2FsbEV4cHJlc3Npb246IHRzLkNhbGxFeHByZXNzaW9uLCBpZGVudDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGV4cHJlc3Npb24gPSBjYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBpZiAoZXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICBjb25zdCBpZGVudGlmaWVyID0gPHRzLklkZW50aWZpZXI+ZXhwcmVzc2lvbjtcbiAgICByZXR1cm4gaWRlbnRpZmllci50ZXh0ID09PSBpZGVudDtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qIEBpbnRlcm5hbCAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29yZE1hcEVudHJ5PFQgZXh0ZW5kcyBNZXRhZGF0YUVudHJ5PihcbiAgICBlbnRyeTogVCwgbm9kZTogdHMuTm9kZSxcbiAgICBub2RlTWFwOiBNYXA8TWV0YWRhdGFWYWx1ZXxDbGFzc01ldGFkYXRhfEludGVyZmFjZU1ldGFkYXRhfEZ1bmN0aW9uTWV0YWRhdGEsIHRzLk5vZGU+LFxuICAgIHNvdXJjZUZpbGU/OiB0cy5Tb3VyY2VGaWxlKSB7XG4gIGlmICghbm9kZU1hcC5oYXMoZW50cnkpKSB7XG4gICAgbm9kZU1hcC5zZXQoZW50cnksIG5vZGUpO1xuICAgIGlmIChub2RlICYmIChpc01ldGFkYXRhSW1wb3J0ZWRTeW1ib2xSZWZlcmVuY2VFeHByZXNzaW9uKGVudHJ5KSB8fFxuICAgICAgICAgICAgICAgICBpc01ldGFkYXRhSW1wb3J0RGVmYXVsdFJlZmVyZW5jZShlbnRyeSkpICYmXG4gICAgICAgIGVudHJ5LmxpbmUgPT0gbnVsbCkge1xuICAgICAgY29uc3QgaW5mbyA9IHNvdXJjZUluZm8obm9kZSwgc291cmNlRmlsZSk7XG4gICAgICBpZiAoaW5mby5saW5lICE9IG51bGwpIGVudHJ5LmxpbmUgPSBpbmZvLmxpbmU7XG4gICAgICBpZiAoaW5mby5jaGFyYWN0ZXIgIT0gbnVsbCkgZW50cnkuY2hhcmFjdGVyID0gaW5mby5jaGFyYWN0ZXI7XG4gICAgfVxuICB9XG4gIHJldHVybiBlbnRyeTtcbn1cblxuLyoqXG4gKiB0cy5mb3JFYWNoQ2hpbGQgc3RvcHMgaXRlcmF0aW5nIGNoaWxkcmVuIHdoZW4gdGhlIGNhbGxiYWNrIHJldHVybiBhIHRydXRoeSB2YWx1ZS5cbiAqIFRoaXMgbWV0aG9kIGludmVydHMgdGhpcyB0byBpbXBsZW1lbnQgYW4gYGV2ZXJ5YCBzdHlsZSBpdGVyYXRvci4gSXQgd2lsbCByZXR1cm5cbiAqIHRydWUgaWYgZXZlcnkgY2FsbCB0byBgY2JgIHJldHVybnMgYHRydWVgLlxuICovXG5mdW5jdGlvbiBldmVyeU5vZGVDaGlsZChub2RlOiB0cy5Ob2RlLCBjYjogKG5vZGU6IHRzLk5vZGUpID0+IGJvb2xlYW4pIHtcbiAgcmV0dXJuICF0cy5mb3JFYWNoQ2hpbGQobm9kZSwgbm9kZSA9PiAhY2Iobm9kZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcmltaXRpdmUodmFsdWU6IGFueSk6IGJvb2xlYW4ge1xuICByZXR1cm4gT2JqZWN0KHZhbHVlKSAhPT0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGlzRGVmaW5lZChvYmo6IGFueSk6IGJvb2xlYW4ge1xuICByZXR1cm4gb2JqICE9PSB1bmRlZmluZWQ7XG59XG5cbi8vIGltcG9ydCB7cHJvcGVydHlOYW1lIGFzIG5hbWV9IGZyb20gJ3BsYWNlJ1xuLy8gaW1wb3J0IHtuYW1lfSBmcm9tICdwbGFjZSdcbmV4cG9ydCBpbnRlcmZhY2UgSW1wb3J0U3BlY2lmaWVyTWV0YWRhdGEge1xuICBuYW1lOiBzdHJpbmc7XG4gIHByb3BlcnR5TmFtZT86IHN0cmluZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSW1wb3J0TWV0YWRhdGEge1xuICBkZWZhdWx0TmFtZT86IHN0cmluZzsgICAgICAgICAgICAgICAgICAgICAgLy8gaW1wb3J0IGQgZnJvbSAncGxhY2UnXG4gIG5hbWVzcGFjZT86IHN0cmluZzsgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbXBvcnQgKiBhcyBkIGZyb20gJ3BsYWNlJ1xuICBuYW1lZEltcG9ydHM/OiBJbXBvcnRTcGVjaWZpZXJNZXRhZGF0YVtdOyAgLy8gaW1wb3J0IHthfSBmcm9tICdwbGFjZSdcbiAgZnJvbTogc3RyaW5nOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZyb20gJ3BsYWNlJ1xufVxuXG5cbmZ1bmN0aW9uIGdldFNvdXJjZUZpbGVPZk5vZGUobm9kZTogdHMuTm9kZSB8IHVuZGVmaW5lZCk6IHRzLlNvdXJjZUZpbGUge1xuICB3aGlsZSAobm9kZSAmJiBub2RlLmtpbmQgIT0gdHMuU3ludGF4S2luZC5Tb3VyY2VGaWxlKSB7XG4gICAgbm9kZSA9IG5vZGUucGFyZW50O1xuICB9XG4gIHJldHVybiA8dHMuU291cmNlRmlsZT5ub2RlO1xufVxuXG4vKiBAaW50ZXJuYWwgKi9cbmV4cG9ydCBmdW5jdGlvbiBzb3VyY2VJbmZvKFxuICAgIG5vZGU6IHRzLk5vZGUgfCB1bmRlZmluZWQsIHNvdXJjZUZpbGU6IHRzLlNvdXJjZUZpbGUgfCB1bmRlZmluZWQpOiBNZXRhZGF0YVNvdXJjZUxvY2F0aW9uSW5mbyB7XG4gIGlmIChub2RlKSB7XG4gICAgc291cmNlRmlsZSA9IHNvdXJjZUZpbGUgfHwgZ2V0U291cmNlRmlsZU9mTm9kZShub2RlKTtcbiAgICBpZiAoc291cmNlRmlsZSkge1xuICAgICAgcmV0dXJuIHRzLmdldExpbmVBbmRDaGFyYWN0ZXJPZlBvc2l0aW9uKHNvdXJjZUZpbGUsIG5vZGUuZ2V0U3RhcnQoc291cmNlRmlsZSkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4ge307XG59XG5cbi8qIEBpbnRlcm5hbCAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVycm9yU3ltYm9sKFxuICAgIG1lc3NhZ2U6IHN0cmluZywgbm9kZT86IHRzLk5vZGUsIGNvbnRleHQ/OiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sXG4gICAgc291cmNlRmlsZT86IHRzLlNvdXJjZUZpbGUpOiBNZXRhZGF0YUVycm9yIHtcbiAgY29uc3QgcmVzdWx0OiBNZXRhZGF0YUVycm9yID0ge19fc3ltYm9saWM6ICdlcnJvcicsIG1lc3NhZ2UsIC4uLnNvdXJjZUluZm8obm9kZSwgc291cmNlRmlsZSl9O1xuICBpZiAoY29udGV4dCkge1xuICAgIHJlc3VsdC5jb250ZXh0ID0gY29udGV4dDtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFByb2R1Y2UgYSBzeW1ib2xpYyByZXByZXNlbnRhdGlvbiBvZiBhbiBleHByZXNzaW9uIGZvbGRpbmcgdmFsdWVzIGludG8gdGhlaXIgZmluYWwgdmFsdWUgd2hlblxuICogcG9zc2libGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBFdmFsdWF0b3Ige1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgc3ltYm9sczogU3ltYm9scywgcHJpdmF0ZSBub2RlTWFwOiBNYXA8TWV0YWRhdGFFbnRyeSwgdHMuTm9kZT4sXG4gICAgICBwcml2YXRlIG9wdGlvbnM6IENvbGxlY3Rvck9wdGlvbnMgPSB7fSxcbiAgICAgIHByaXZhdGUgcmVjb3JkRXhwb3J0PzogKG5hbWU6IHN0cmluZywgdmFsdWU6IE1ldGFkYXRhVmFsdWUpID0+IHZvaWQpIHt9XG5cbiAgbmFtZU9mKG5vZGU6IHRzLk5vZGV8dW5kZWZpbmVkKTogc3RyaW5nfE1ldGFkYXRhRXJyb3Ige1xuICAgIGlmIChub2RlICYmIG5vZGUua2luZCA9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICAgIHJldHVybiAoPHRzLklkZW50aWZpZXI+bm9kZSkudGV4dDtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gbm9kZSAmJiB0aGlzLmV2YWx1YXRlTm9kZShub2RlKTtcbiAgICBpZiAoaXNNZXRhZGF0YUVycm9yKHJlc3VsdCkgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBlcnJvclN5bWJvbChcbiAgICAgICAgICAnTmFtZSBleHBlY3RlZCcsIG5vZGUsIHtyZWNlaXZlZDogKG5vZGUgJiYgbm9kZS5nZXRUZXh0KCkpIHx8ICc8bWlzc2luZz4nfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZXhwcmVzc2lvbiByZXByZXNlbnRlZCBieSBgbm9kZWAgY2FuIGJlIGZvbGRlZCBpbnRvIGEgbGl0ZXJhbCBleHByZXNzaW9uLlxuICAgKlxuICAgKiBGb3IgZXhhbXBsZSwgYSBsaXRlcmFsIGlzIGFsd2F5cyBmb2xkYWJsZS4gVGhpcyBtZWFucyB0aGF0IGxpdGVyYWwgZXhwcmVzc2lvbnMgc3VjaCBhcyBgMS4yYFxuICAgKiBgXCJTb21lIHZhbHVlXCJgIGB0cnVlYCBgZmFsc2VgIGFyZSBmb2xkYWJsZS5cbiAgICpcbiAgICogLSBBbiBvYmplY3QgbGl0ZXJhbCBpcyBmb2xkYWJsZSBpZiBhbGwgdGhlIHByb3BlcnRpZXMgaW4gdGhlIGxpdGVyYWwgYXJlIGZvbGRhYmxlLlxuICAgKiAtIEFuIGFycmF5IGxpdGVyYWwgaXMgZm9sZGFibGUgaWYgYWxsIHRoZSBlbGVtZW50cyBhcmUgZm9sZGFibGUuXG4gICAqIC0gQSBjYWxsIGlzIGZvbGRhYmxlIGlmIGl0IGlzIGEgY2FsbCB0byBhIEFycmF5LnByb3RvdHlwZS5jb25jYXQgb3IgYSBjYWxsIHRvIENPTlNUX0VYUFIuXG4gICAqIC0gQSBwcm9wZXJ0eSBhY2Nlc3MgaXMgZm9sZGFibGUgaWYgdGhlIG9iamVjdCBpcyBmb2xkYWJsZS5cbiAgICogLSBBIGFycmF5IGluZGV4IGlzIGZvbGRhYmxlIGlmIGluZGV4IGV4cHJlc3Npb24gaXMgZm9sZGFibGUgYW5kIHRoZSBhcnJheSBpcyBmb2xkYWJsZS5cbiAgICogLSBCaW5hcnkgb3BlcmF0b3IgZXhwcmVzc2lvbnMgYXJlIGZvbGRhYmxlIGlmIHRoZSBsZWZ0IGFuZCByaWdodCBleHByZXNzaW9ucyBhcmUgZm9sZGFibGUgYW5kXG4gICAqICAgaXQgaXMgb25lIG9mICcrJywgJy0nLCAnKicsICcvJywgJyUnLCAnfHwnLCBhbmQgJyYmJy5cbiAgICogLSBBbiBpZGVudGlmaWVyIGlzIGZvbGRhYmxlIGlmIGEgdmFsdWUgY2FuIGJlIGZvdW5kIGZvciBpdHMgc3ltYm9sIGluIHRoZSBldmFsdWF0b3Igc3ltYm9sXG4gICAqICAgdGFibGUuXG4gICAqL1xuICBwdWJsaWMgaXNGb2xkYWJsZShub2RlOiB0cy5Ob2RlKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuaXNGb2xkYWJsZVdvcmtlcihub2RlLCBuZXcgTWFwPHRzLk5vZGUsIGJvb2xlYW4+KCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ZvbGRhYmxlV29ya2VyKG5vZGU6IHRzLk5vZGV8dW5kZWZpbmVkLCBmb2xkaW5nOiBNYXA8dHMuTm9kZSwgYm9vbGVhbj4pOiBib29sZWFuIHtcbiAgICBpZiAobm9kZSkge1xuICAgICAgc3dpdGNoIChub2RlLmtpbmQpIHtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uOlxuICAgICAgICAgIHJldHVybiBldmVyeU5vZGVDaGlsZChub2RlLCBjaGlsZCA9PiB7XG4gICAgICAgICAgICBpZiAoY2hpbGQua2luZCA9PT0gdHMuU3ludGF4S2luZC5Qcm9wZXJ0eUFzc2lnbm1lbnQpIHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlBc3NpZ25tZW50ID0gPHRzLlByb3BlcnR5QXNzaWdubWVudD5jaGlsZDtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNGb2xkYWJsZVdvcmtlcihwcm9wZXJ0eUFzc2lnbm1lbnQuaW5pdGlhbGl6ZXIsIGZvbGRpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH0pO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbjpcbiAgICAgICAgICByZXR1cm4gZXZlcnlOb2RlQ2hpbGQobm9kZSwgY2hpbGQgPT4gdGhpcy5pc0ZvbGRhYmxlV29ya2VyKGNoaWxkLCBmb2xkaW5nKSk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbjpcbiAgICAgICAgICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IDx0cy5DYWxsRXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICAgIC8vIFdlIGNhbiBmb2xkIGEgPGFycmF5Pi5jb25jYXQoPHY+KS5cbiAgICAgICAgICBpZiAoaXNNZXRob2RDYWxsT2YoY2FsbEV4cHJlc3Npb24sICdjb25jYXQnKSAmJlxuICAgICAgICAgICAgICBhcnJheU9yRW1wdHkoY2FsbEV4cHJlc3Npb24uYXJndW1lbnRzKS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGFycmF5Tm9kZSA9ICg8dHMuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uPmNhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24pLmV4cHJlc3Npb247XG4gICAgICAgICAgICBpZiAodGhpcy5pc0ZvbGRhYmxlV29ya2VyKGFycmF5Tm9kZSwgZm9sZGluZykgJiZcbiAgICAgICAgICAgICAgICB0aGlzLmlzRm9sZGFibGVXb3JrZXIoY2FsbEV4cHJlc3Npb24uYXJndW1lbnRzWzBdLCBmb2xkaW5nKSkge1xuICAgICAgICAgICAgICAvLyBJdCBuZWVkcyB0byBiZSBhbiBhcnJheS5cbiAgICAgICAgICAgICAgY29uc3QgYXJyYXlWYWx1ZSA9IHRoaXMuZXZhbHVhdGVOb2RlKGFycmF5Tm9kZSk7XG4gICAgICAgICAgICAgIGlmIChhcnJheVZhbHVlICYmIEFycmF5LmlzQXJyYXkoYXJyYXlWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFdlIGNhbiBmb2xkIGEgY2FsbCB0byBDT05TVF9FWFBSXG4gICAgICAgICAgaWYgKGlzQ2FsbE9mKGNhbGxFeHByZXNzaW9uLCAnQ09OU1RfRVhQUicpICYmXG4gICAgICAgICAgICAgIGFycmF5T3JFbXB0eShjYWxsRXhwcmVzc2lvbi5hcmd1bWVudHMpLmxlbmd0aCA9PT0gMSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzRm9sZGFibGVXb3JrZXIoY2FsbEV4cHJlc3Npb24uYXJndW1lbnRzWzBdLCBmb2xkaW5nKTtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5Ob1N1YnN0aXR1dGlvblRlbXBsYXRlTGl0ZXJhbDpcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlN0cmluZ0xpdGVyYWw6XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbDpcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk51bGxLZXl3b3JkOlxuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuVHJ1ZUtleXdvcmQ6XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5GYWxzZUtleXdvcmQ6XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UZW1wbGF0ZUhlYWQ6XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UZW1wbGF0ZU1pZGRsZTpcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlRlbXBsYXRlVGFpbDpcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlBhcmVudGhlc2l6ZWRFeHByZXNzaW9uOlxuICAgICAgICAgIGNvbnN0IHBhcmVudGhlc2l6ZWRFeHByZXNzaW9uID0gPHRzLlBhcmVudGhlc2l6ZWRFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaXNGb2xkYWJsZVdvcmtlcihwYXJlbnRoZXNpemVkRXhwcmVzc2lvbi5leHByZXNzaW9uLCBmb2xkaW5nKTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb246XG4gICAgICAgICAgY29uc3QgYmluYXJ5RXhwcmVzc2lvbiA9IDx0cy5CaW5hcnlFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgICAgc3dpdGNoIChiaW5hcnlFeHByZXNzaW9uLm9wZXJhdG9yVG9rZW4ua2luZCkge1xuICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlBsdXNUb2tlbjpcbiAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5NaW51c1Rva2VuOlxuICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkFzdGVyaXNrVG9rZW46XG4gICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuU2xhc2hUb2tlbjpcbiAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5QZXJjZW50VG9rZW46XG4gICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQW1wZXJzYW5kQW1wZXJzYW5kVG9rZW46XG4gICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW46XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzRm9sZGFibGVXb3JrZXIoYmluYXJ5RXhwcmVzc2lvbi5sZWZ0LCBmb2xkaW5nKSAmJlxuICAgICAgICAgICAgICAgICAgdGhpcy5pc0ZvbGRhYmxlV29ya2VyKGJpbmFyeUV4cHJlc3Npb24ucmlnaHQsIGZvbGRpbmcpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbjpcbiAgICAgICAgICBjb25zdCBwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24gPSA8dHMuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaXNGb2xkYWJsZVdvcmtlcihwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24uZXhwcmVzc2lvbiwgZm9sZGluZyk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbjpcbiAgICAgICAgICBjb25zdCBlbGVtZW50QWNjZXNzRXhwcmVzc2lvbiA9IDx0cy5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICAgIHJldHVybiB0aGlzLmlzRm9sZGFibGVXb3JrZXIoZWxlbWVudEFjY2Vzc0V4cHJlc3Npb24uZXhwcmVzc2lvbiwgZm9sZGluZykgJiZcbiAgICAgICAgICAgICAgdGhpcy5pc0ZvbGRhYmxlV29ya2VyKGVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uLmFyZ3VtZW50RXhwcmVzc2lvbiwgZm9sZGluZyk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5JZGVudGlmaWVyOlxuICAgICAgICAgIGxldCBpZGVudGlmaWVyID0gPHRzLklkZW50aWZpZXI+bm9kZTtcbiAgICAgICAgICBsZXQgcmVmZXJlbmNlID0gdGhpcy5zeW1ib2xzLnJlc29sdmUoaWRlbnRpZmllci50ZXh0KTtcbiAgICAgICAgICBpZiAocmVmZXJlbmNlICE9PSB1bmRlZmluZWQgJiYgaXNQcmltaXRpdmUocmVmZXJlbmNlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuVGVtcGxhdGVFeHByZXNzaW9uOlxuICAgICAgICAgIGNvbnN0IHRlbXBsYXRlRXhwcmVzc2lvbiA9IDx0cy5UZW1wbGF0ZUV4cHJlc3Npb24+bm9kZTtcbiAgICAgICAgICByZXR1cm4gdGVtcGxhdGVFeHByZXNzaW9uLnRlbXBsYXRlU3BhbnMuZXZlcnkoXG4gICAgICAgICAgICAgIHNwYW4gPT4gdGhpcy5pc0ZvbGRhYmxlV29ya2VyKHNwYW4uZXhwcmVzc2lvbiwgZm9sZGluZykpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogUHJvZHVjZSBhIEpTT04gc2VyaWFsaWFibGUgb2JqZWN0IHJlcHJlc2VudGluZyBgbm9kZWAuIFRoZSBmb2xkYWJsZSB2YWx1ZXMgaW4gdGhlIGV4cHJlc3Npb25cbiAgICogdHJlZSBhcmUgZm9sZGVkLiBGb3IgZXhhbXBsZSwgYSBub2RlIHJlcHJlc2VudGluZyBgMSArIDJgIGlzIGZvbGRlZCBpbnRvIGAzYC5cbiAgICovXG4gIHB1YmxpYyBldmFsdWF0ZU5vZGUobm9kZTogdHMuTm9kZSwgcHJlZmVyUmVmZXJlbmNlPzogYm9vbGVhbik6IE1ldGFkYXRhVmFsdWUge1xuICAgIGNvbnN0IHQgPSB0aGlzO1xuICAgIGxldCBlcnJvcjogTWV0YWRhdGFFcnJvcnx1bmRlZmluZWQ7XG5cbiAgICBmdW5jdGlvbiByZWNvcmRFbnRyeShlbnRyeTogTWV0YWRhdGFWYWx1ZSwgbm9kZTogdHMuTm9kZSk6IE1ldGFkYXRhVmFsdWUge1xuICAgICAgaWYgKHQub3B0aW9ucy5zdWJzdGl0dXRlRXhwcmVzc2lvbikge1xuICAgICAgICBjb25zdCBuZXdFbnRyeSA9IHQub3B0aW9ucy5zdWJzdGl0dXRlRXhwcmVzc2lvbihlbnRyeSwgbm9kZSk7XG4gICAgICAgIGlmICh0LnJlY29yZEV4cG9ydCAmJiBuZXdFbnRyeSAhPSBlbnRyeSAmJiBpc01ldGFkYXRhR2xvYmFsUmVmZXJlbmNlRXhwcmVzc2lvbihuZXdFbnRyeSkpIHtcbiAgICAgICAgICB0LnJlY29yZEV4cG9ydChuZXdFbnRyeS5uYW1lLCBlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgZW50cnkgPSBuZXdFbnRyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZWNvcmRNYXBFbnRyeShlbnRyeSwgbm9kZSwgdC5ub2RlTWFwKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0ZvbGRhYmxlRXJyb3IodmFsdWU6IGFueSk6IHZhbHVlIGlzIE1ldGFkYXRhRXJyb3Ige1xuICAgICAgcmV0dXJuICF0Lm9wdGlvbnMudmVyYm9zZUludmFsaWRFeHByZXNzaW9uICYmIGlzTWV0YWRhdGFFcnJvcih2YWx1ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZU5hbWUgPSAobmFtZTogc3RyaW5nLCBwcmVmZXJSZWZlcmVuY2U/OiBib29sZWFuKTogTWV0YWRhdGFWYWx1ZSA9PiB7XG4gICAgICBjb25zdCByZWZlcmVuY2UgPSB0aGlzLnN5bWJvbHMucmVzb2x2ZShuYW1lLCBwcmVmZXJSZWZlcmVuY2UpO1xuICAgICAgaWYgKHJlZmVyZW5jZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIEVuY29kZSBhcyBhIGdsb2JhbCByZWZlcmVuY2UuIFN0YXRpY1JlZmxlY3RvciB3aWxsIGNoZWNrIHRoZSByZWZlcmVuY2UuXG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeSh7X19zeW1ib2xpYzogJ3JlZmVyZW5jZScsIG5hbWV9LCBub2RlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZWZlcmVuY2UgJiYgaXNNZXRhZGF0YVN5bWJvbGljUmVmZXJlbmNlRXhwcmVzc2lvbihyZWZlcmVuY2UpKSB7XG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeSh7Li4ucmVmZXJlbmNlfSwgbm9kZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVmZXJlbmNlO1xuICAgIH07XG5cbiAgICBzd2l0Y2ggKG5vZGUua2luZCkge1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uOlxuICAgICAgICBsZXQgb2JqOiB7W25hbWU6IHN0cmluZ106IGFueX0gPSB7fTtcbiAgICAgICAgbGV0IHF1b3RlZDogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIGNoaWxkID0+IHtcbiAgICAgICAgICBzd2l0Y2ggKGNoaWxkLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5TaG9ydGhhbmRQcm9wZXJ0eUFzc2lnbm1lbnQ6XG4gICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuUHJvcGVydHlBc3NpZ25tZW50OlxuICAgICAgICAgICAgICBjb25zdCBhc3NpZ25tZW50ID0gPHRzLlByb3BlcnR5QXNzaWdubWVudHx0cy5TaG9ydGhhbmRQcm9wZXJ0eUFzc2lnbm1lbnQ+Y2hpbGQ7XG4gICAgICAgICAgICAgIGlmIChhc3NpZ25tZW50Lm5hbWUua2luZCA9PSB0cy5TeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gKGFzc2lnbm1lbnQubmFtZSBhcyB0cy5TdHJpbmdMaXRlcmFsKS50ZXh0O1xuICAgICAgICAgICAgICAgIHF1b3RlZC5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHRoaXMubmFtZU9mKGFzc2lnbm1lbnQubmFtZSk7XG4gICAgICAgICAgICAgIGlmIChpc0ZvbGRhYmxlRXJyb3IocHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgICAgICAgIGVycm9yID0gcHJvcGVydHlOYW1lO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5VmFsdWUgPSBpc1Byb3BlcnR5QXNzaWdubWVudChhc3NpZ25tZW50KSA/XG4gICAgICAgICAgICAgICAgICB0aGlzLmV2YWx1YXRlTm9kZShhc3NpZ25tZW50LmluaXRpYWxpemVyLCAvKiBwcmVmZXJSZWZlcmVuY2UgKi8gdHJ1ZSkgOlxuICAgICAgICAgICAgICAgICAgcmVzb2x2ZU5hbWUocHJvcGVydHlOYW1lLCAvKiBwcmVmZXJSZWZlcmVuY2UgKi8gdHJ1ZSk7XG4gICAgICAgICAgICAgIGlmIChpc0ZvbGRhYmxlRXJyb3IocHJvcGVydHlWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICBlcnJvciA9IHByb3BlcnR5VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBTdG9wIHRoZSBmb3JFYWNoQ2hpbGQuXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb2JqW3Byb3BlcnR5TmFtZV0gPSBpc1Byb3BlcnR5QXNzaWdubWVudChhc3NpZ25tZW50KSA/XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZEVudHJ5KHByb3BlcnR5VmFsdWUsIGFzc2lnbm1lbnQuaW5pdGlhbGl6ZXIpIDpcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGVycm9yO1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLnF1b3RlZE5hbWVzICYmIHF1b3RlZC5sZW5ndGgpIHtcbiAgICAgICAgICBvYmpbJyRxdW90ZWQkJ10gPSBxdW90ZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KG9iaiwgbm9kZSk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbjpcbiAgICAgICAgbGV0IGFycjogTWV0YWRhdGFWYWx1ZVtdID0gW107XG4gICAgICAgIHRzLmZvckVhY2hDaGlsZChub2RlLCBjaGlsZCA9PiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmV2YWx1YXRlTm9kZShjaGlsZCwgLyogcHJlZmVyUmVmZXJlbmNlICovIHRydWUpO1xuXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIGVycm9yXG4gICAgICAgICAgaWYgKGlzRm9sZGFibGVFcnJvcih2YWx1ZSkpIHtcbiAgICAgICAgICAgIGVycm9yID0gdmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIFN0b3AgdGhlIGZvckVhY2hDaGlsZC5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBIYW5kbGUgc3ByZWFkIGV4cHJlc3Npb25zXG4gICAgICAgICAgaWYgKGlzTWV0YWRhdGFTeW1ib2xpY1NwcmVhZEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZS5leHByZXNzaW9uKSkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHNwcmVhZFZhbHVlIG9mIHZhbHVlLmV4cHJlc3Npb24pIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChzcHJlYWRWYWx1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGFyci5wdXNoKHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGVycm9yO1xuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoYXJyLCBub2RlKTtcbiAgICAgIGNhc2Ugc3ByZWFkRWxlbWVudFN5bnRheEtpbmQ6XG4gICAgICAgIGxldCBzcHJlYWRFeHByZXNzaW9uID0gdGhpcy5ldmFsdWF0ZU5vZGUoKG5vZGUgYXMgYW55KS5leHByZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KHtfX3N5bWJvbGljOiAnc3ByZWFkJywgZXhwcmVzc2lvbjogc3ByZWFkRXhwcmVzc2lvbn0sIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNhbGxFeHByZXNzaW9uOlxuICAgICAgICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IDx0cy5DYWxsRXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICBpZiAoaXNDYWxsT2YoY2FsbEV4cHJlc3Npb24sICdmb3J3YXJkUmVmJykgJiZcbiAgICAgICAgICAgIGFycmF5T3JFbXB0eShjYWxsRXhwcmVzc2lvbi5hcmd1bWVudHMpLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIGNvbnN0IGZpcnN0QXJndW1lbnQgPSBjYWxsRXhwcmVzc2lvbi5hcmd1bWVudHNbMF07XG4gICAgICAgICAgaWYgKGZpcnN0QXJndW1lbnQua2luZCA9PSB0cy5TeW50YXhLaW5kLkFycm93RnVuY3Rpb24pIHtcbiAgICAgICAgICAgIGNvbnN0IGFycm93RnVuY3Rpb24gPSA8dHMuQXJyb3dGdW5jdGlvbj5maXJzdEFyZ3VtZW50O1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KHRoaXMuZXZhbHVhdGVOb2RlKGFycm93RnVuY3Rpb24uYm9keSksIG5vZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhcmdzID0gYXJyYXlPckVtcHR5KGNhbGxFeHByZXNzaW9uLmFyZ3VtZW50cykubWFwKGFyZyA9PiB0aGlzLmV2YWx1YXRlTm9kZShhcmcpKTtcbiAgICAgICAgaWYgKHRoaXMuaXNGb2xkYWJsZShjYWxsRXhwcmVzc2lvbikpIHtcbiAgICAgICAgICBpZiAoaXNNZXRob2RDYWxsT2YoY2FsbEV4cHJlc3Npb24sICdjb25jYXQnKSkge1xuICAgICAgICAgICAgY29uc3QgYXJyYXlWYWx1ZSA9IDxNZXRhZGF0YVZhbHVlW10+dGhpcy5ldmFsdWF0ZU5vZGUoXG4gICAgICAgICAgICAgICAgKDx0cy5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24+Y2FsbEV4cHJlc3Npb24uZXhwcmVzc2lvbikuZXhwcmVzc2lvbik7XG4gICAgICAgICAgICBpZiAoaXNGb2xkYWJsZUVycm9yKGFycmF5VmFsdWUpKSByZXR1cm4gYXJyYXlWYWx1ZTtcbiAgICAgICAgICAgIHJldHVybiBhcnJheVZhbHVlLmNvbmNhdChhcmdzWzBdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWx3YXlzIGZvbGQgYSBDT05TVF9FWFBSIGV2ZW4gaWYgdGhlIGFyZ3VtZW50IGlzIG5vdCBmb2xkYWJsZS5cbiAgICAgICAgaWYgKGlzQ2FsbE9mKGNhbGxFeHByZXNzaW9uLCAnQ09OU1RfRVhQUicpICYmXG4gICAgICAgICAgICBhcnJheU9yRW1wdHkoY2FsbEV4cHJlc3Npb24uYXJndW1lbnRzKS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoYXJnc1swXSwgbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbiA9IHRoaXMuZXZhbHVhdGVOb2RlKGNhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgICBpZiAoaXNGb2xkYWJsZUVycm9yKGV4cHJlc3Npb24pKSB7XG4gICAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KGV4cHJlc3Npb24sIG5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGxldCByZXN1bHQ6IE1ldGFkYXRhU3ltYm9saWNDYWxsRXhwcmVzc2lvbiA9IHtfX3N5bWJvbGljOiAnY2FsbCcsIGV4cHJlc3Npb246IGV4cHJlc3Npb259O1xuICAgICAgICBpZiAoYXJncyAmJiBhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJlc3VsdC5hcmd1bWVudHMgPSBhcmdzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeShyZXN1bHQsIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk5ld0V4cHJlc3Npb246XG4gICAgICAgIGNvbnN0IG5ld0V4cHJlc3Npb24gPSA8dHMuTmV3RXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICBjb25zdCBuZXdBcmdzID0gYXJyYXlPckVtcHR5KG5ld0V4cHJlc3Npb24uYXJndW1lbnRzKS5tYXAoYXJnID0+IHRoaXMuZXZhbHVhdGVOb2RlKGFyZykpO1xuICAgICAgICBjb25zdCBuZXdUYXJnZXQgPSB0aGlzLmV2YWx1YXRlTm9kZShuZXdFeHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgICBpZiAoaXNNZXRhZGF0YUVycm9yKG5ld1RhcmdldCkpIHtcbiAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkobmV3VGFyZ2V0LCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjYWxsOiBNZXRhZGF0YVN5bWJvbGljQ2FsbEV4cHJlc3Npb24gPSB7X19zeW1ib2xpYzogJ25ldycsIGV4cHJlc3Npb246IG5ld1RhcmdldH07XG4gICAgICAgIGlmIChuZXdBcmdzLmxlbmd0aCkge1xuICAgICAgICAgIGNhbGwuYXJndW1lbnRzID0gbmV3QXJncztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoY2FsbCwgbm9kZSk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uOiB7XG4gICAgICAgIGNvbnN0IHByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiA9IDx0cy5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24+bm9kZTtcbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbiA9IHRoaXMuZXZhbHVhdGVOb2RlKHByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgICAgICAgaWYgKGlzRm9sZGFibGVFcnJvcihleHByZXNzaW9uKSkge1xuICAgICAgICAgIHJldHVybiByZWNvcmRFbnRyeShleHByZXNzaW9uLCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBtZW1iZXIgPSB0aGlzLm5hbWVPZihwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24ubmFtZSk7XG4gICAgICAgIGlmIChpc0ZvbGRhYmxlRXJyb3IobWVtYmVyKSkge1xuICAgICAgICAgIHJldHVybiByZWNvcmRFbnRyeShtZW1iZXIsIG5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHByZXNzaW9uICYmIHRoaXMuaXNGb2xkYWJsZShwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24uZXhwcmVzc2lvbikpXG4gICAgICAgICAgcmV0dXJuICg8YW55PmV4cHJlc3Npb24pW21lbWJlcl07XG4gICAgICAgIGlmIChpc01ldGFkYXRhTW9kdWxlUmVmZXJlbmNlRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgICAgICAgIC8vIEEgc2VsZWN0IGludG8gYSBtb2R1bGUgcmVmZXJlbmNlIGFuZCBiZSBjb252ZXJ0ZWQgaW50byBhIHJlZmVyZW5jZSB0byB0aGUgc3ltYm9sXG4gICAgICAgICAgLy8gaW4gdGhlIG1vZHVsZVxuICAgICAgICAgIHJldHVybiByZWNvcmRFbnRyeShcbiAgICAgICAgICAgICAge19fc3ltYm9saWM6ICdyZWZlcmVuY2UnLCBtb2R1bGU6IGV4cHJlc3Npb24ubW9kdWxlLCBuYW1lOiBtZW1iZXJ9LCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoe19fc3ltYm9saWM6ICdzZWxlY3QnLCBleHByZXNzaW9uLCBtZW1iZXJ9LCBub2RlKTtcbiAgICAgIH1cbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbjoge1xuICAgICAgICBjb25zdCBlbGVtZW50QWNjZXNzRXhwcmVzc2lvbiA9IDx0cy5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICBjb25zdCBleHByZXNzaW9uID0gdGhpcy5ldmFsdWF0ZU5vZGUoZWxlbWVudEFjY2Vzc0V4cHJlc3Npb24uZXhwcmVzc2lvbik7XG4gICAgICAgIGlmIChpc0ZvbGRhYmxlRXJyb3IoZXhwcmVzc2lvbikpIHtcbiAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoZXhwcmVzc2lvbiwgbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFlbGVtZW50QWNjZXNzRXhwcmVzc2lvbi5hcmd1bWVudEV4cHJlc3Npb24pIHtcbiAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoZXJyb3JTeW1ib2woJ0V4cHJlc3Npb24gZm9ybSBub3Qgc3VwcG9ydGVkJywgbm9kZSksIG5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5ldmFsdWF0ZU5vZGUoZWxlbWVudEFjY2Vzc0V4cHJlc3Npb24uYXJndW1lbnRFeHByZXNzaW9uKTtcbiAgICAgICAgaWYgKGlzRm9sZGFibGVFcnJvcihleHByZXNzaW9uKSkge1xuICAgICAgICAgIHJldHVybiByZWNvcmRFbnRyeShleHByZXNzaW9uLCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5pc0ZvbGRhYmxlKGVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uLmV4cHJlc3Npb24pICYmXG4gICAgICAgICAgICB0aGlzLmlzRm9sZGFibGUoZWxlbWVudEFjY2Vzc0V4cHJlc3Npb24uYXJndW1lbnRFeHByZXNzaW9uKSlcbiAgICAgICAgICByZXR1cm4gKDxhbnk+ZXhwcmVzc2lvbilbPHN0cmluZ3xudW1iZXI+aW5kZXhdO1xuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoe19fc3ltYm9saWM6ICdpbmRleCcsIGV4cHJlc3Npb24sIGluZGV4fSwgbm9kZSk7XG4gICAgICB9XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuSWRlbnRpZmllcjpcbiAgICAgICAgY29uc3QgaWRlbnRpZmllciA9IDx0cy5JZGVudGlmaWVyPm5vZGU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBpZGVudGlmaWVyLnRleHQ7XG4gICAgICAgIHJldHVybiByZXNvbHZlTmFtZShuYW1lLCBwcmVmZXJSZWZlcmVuY2UpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlR5cGVSZWZlcmVuY2U6XG4gICAgICAgIGNvbnN0IHR5cGVSZWZlcmVuY2VOb2RlID0gPHRzLlR5cGVSZWZlcmVuY2VOb2RlPm5vZGU7XG4gICAgICAgIGNvbnN0IHR5cGVOYW1lTm9kZSA9IHR5cGVSZWZlcmVuY2VOb2RlLnR5cGVOYW1lO1xuICAgICAgICBjb25zdCBnZXRSZWZlcmVuY2U6ICh0eXBlTmFtZU5vZGU6IHRzLklkZW50aWZpZXIgfCB0cy5RdWFsaWZpZWROYW1lKSA9PiBNZXRhZGF0YVZhbHVlID1cbiAgICAgICAgICAgIG5vZGUgPT4ge1xuICAgICAgICAgICAgICBpZiAodHlwZU5hbWVOb2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuUXVhbGlmaWVkTmFtZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1YWxpZmllZE5hbWUgPSA8dHMuUXVhbGlmaWVkTmFtZT5ub2RlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxlZnQgPSB0aGlzLmV2YWx1YXRlTm9kZShxdWFsaWZpZWROYW1lLmxlZnQpO1xuICAgICAgICAgICAgICAgIGlmIChpc01ldGFkYXRhTW9kdWxlUmVmZXJlbmNlRXhwcmVzc2lvbihsZWZ0KSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KFxuICAgICAgICAgICAgICAgICAgICAgIDxNZXRhZGF0YUltcG9ydGVkU3ltYm9sUmVmZXJlbmNlRXhwcmVzc2lvbj57XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3N5bWJvbGljOiAncmVmZXJlbmNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZTogbGVmdC5tb2R1bGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBxdWFsaWZpZWROYW1lLnJpZ2h0LnRleHRcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIG5vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBSZWNvcmQgYSB0eXBlIHJlZmVyZW5jZSB0byBhIGRlY2xhcmVkIHR5cGUgYXMgYSBzZWxlY3QuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtfX3N5bWJvbGljOiAnc2VsZWN0JywgZXhwcmVzc2lvbjogbGVmdCwgbWVtYmVyOiBxdWFsaWZpZWROYW1lLnJpZ2h0LnRleHR9O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkZW50aWZpZXIgPSA8dHMuSWRlbnRpZmllcj50eXBlTmFtZU5vZGU7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ltYm9sID0gdGhpcy5zeW1ib2xzLnJlc29sdmUoaWRlbnRpZmllci50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAoaXNGb2xkYWJsZUVycm9yKHN5bWJvbCkgfHwgaXNNZXRhZGF0YVN5bWJvbGljUmVmZXJlbmNlRXhwcmVzc2lvbihzeW1ib2wpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoc3ltYm9sLCBub2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KFxuICAgICAgICAgICAgICAgICAgICBlcnJvclN5bWJvbCgnQ291bGQgbm90IHJlc29sdmUgdHlwZScsIG5vZGUsIHt0eXBlTmFtZTogaWRlbnRpZmllci50ZXh0fSksIG5vZGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICBjb25zdCB0eXBlUmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKHR5cGVOYW1lTm9kZSk7XG4gICAgICAgIGlmIChpc0ZvbGRhYmxlRXJyb3IodHlwZVJlZmVyZW5jZSkpIHtcbiAgICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkodHlwZVJlZmVyZW5jZSwgbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFpc01ldGFkYXRhTW9kdWxlUmVmZXJlbmNlRXhwcmVzc2lvbih0eXBlUmVmZXJlbmNlKSAmJlxuICAgICAgICAgICAgdHlwZVJlZmVyZW5jZU5vZGUudHlwZUFyZ3VtZW50cyAmJiB0eXBlUmVmZXJlbmNlTm9kZS50eXBlQXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSB0eXBlUmVmZXJlbmNlTm9kZS50eXBlQXJndW1lbnRzLm1hcChlbGVtZW50ID0+IHRoaXMuZXZhbHVhdGVOb2RlKGVsZW1lbnQpKTtcbiAgICAgICAgICAvLyBUT0RPOiBSZW1vdmUgdHlwZWNhc3Qgd2hlbiB1cGdyYWRlZCB0byAyLjAgYXMgaXQgd2lsbCBiZSBjb3JyZWN0bHkgaW5mZXJyZWQuXG4gICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiAxLjkgZG8gbm90IGluZmVyIHRoaXMgY29ycmVjdGx5LlxuICAgICAgICAgICg8TWV0YWRhdGFJbXBvcnRlZFN5bWJvbFJlZmVyZW5jZUV4cHJlc3Npb24+dHlwZVJlZmVyZW5jZSkuYXJndW1lbnRzID0gYXJncztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkodHlwZVJlZmVyZW5jZSwgbm9kZSk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuVW5pb25UeXBlOlxuICAgICAgICBjb25zdCB1bmlvblR5cGUgPSA8dHMuVW5pb25UeXBlTm9kZT5ub2RlO1xuXG4gICAgICAgIC8vIFJlbW92ZSBudWxsIGFuZCB1bmRlZmluZWQgZnJvbSB0aGUgbGlzdCBvZiB1bmlvbnMuXG4gICAgICAgIGNvbnN0IHJlZmVyZW5jZXMgPSB1bmlvblR5cGUudHlwZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuID0+IG4ua2luZCAhPSB0cy5TeW50YXhLaW5kLk51bGxLZXl3b3JkICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuLmtpbmQgIT0gdHMuU3ludGF4S2luZC5VbmRlZmluZWRLZXl3b3JkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAobiA9PiB0aGlzLmV2YWx1YXRlTm9kZShuKSk7XG5cbiAgICAgICAgLy8gVGhlIHJlbW1haW5pbmcgcmVmZXJlbmNlIG11c3QgYmUgdGhlIHNhbWUuIElmIHR3byBoYXZlIHR5cGUgYXJndW1lbnRzIGNvbnNpZGVyIHRoZW1cbiAgICAgICAgLy8gZGlmZmVyZW50IGV2ZW4gaWYgdGhlIHR5cGUgYXJndW1lbnRzIGFyZSB0aGUgc2FtZS5cbiAgICAgICAgbGV0IGNhbmRpZGF0ZTogYW55ID0gbnVsbDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZWZlcmVuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgcmVmZXJlbmNlID0gcmVmZXJlbmNlc1tpXTtcbiAgICAgICAgICBpZiAoaXNNZXRhZGF0YVN5bWJvbGljUmVmZXJlbmNlRXhwcmVzc2lvbihyZWZlcmVuY2UpKSB7XG4gICAgICAgICAgICBpZiAoY2FuZGlkYXRlKSB7XG4gICAgICAgICAgICAgIGlmICgocmVmZXJlbmNlIGFzIGFueSkubmFtZSA9PSBjYW5kaWRhdGUubmFtZSAmJlxuICAgICAgICAgICAgICAgICAgKHJlZmVyZW5jZSBhcyBhbnkpLm1vZHVsZSA9PSBjYW5kaWRhdGUubW9kdWxlICYmICEocmVmZXJlbmNlIGFzIGFueSkuYXJndW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlID0gcmVmZXJlbmNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjYW5kaWRhdGUgPSByZWZlcmVuY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiByZWZlcmVuY2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjYW5kaWRhdGUpIHJldHVybiBjYW5kaWRhdGU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk5vU3Vic3RpdHV0aW9uVGVtcGxhdGVMaXRlcmFsOlxuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlN0cmluZ0xpdGVyYWw6XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuVGVtcGxhdGVIZWFkOlxuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlRlbXBsYXRlVGFpbDpcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UZW1wbGF0ZU1pZGRsZTpcbiAgICAgICAgcmV0dXJuICg8dHMuTGl0ZXJhbExpa2VOb2RlPm5vZGUpLnRleHQ7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWw6XG4gICAgICAgIHJldHVybiBwYXJzZUZsb2F0KCg8dHMuTGl0ZXJhbEV4cHJlc3Npb24+bm9kZSkudGV4dCk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQW55S2V5d29yZDpcbiAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KHtfX3N5bWJvbGljOiAncmVmZXJlbmNlJywgbmFtZTogJ2FueSd9LCBub2RlKTtcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5TdHJpbmdLZXl3b3JkOlxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoe19fc3ltYm9saWM6ICdyZWZlcmVuY2UnLCBuYW1lOiAnc3RyaW5nJ30sIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk51bWJlcktleXdvcmQ6XG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeSh7X19zeW1ib2xpYzogJ3JlZmVyZW5jZScsIG5hbWU6ICdudW1iZXInfSwgbm9kZSk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQm9vbGVhbktleXdvcmQ6XG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeSh7X19zeW1ib2xpYzogJ3JlZmVyZW5jZScsIG5hbWU6ICdib29sZWFuJ30sIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkFycmF5VHlwZTpcbiAgICAgICAgY29uc3QgYXJyYXlUeXBlTm9kZSA9IDx0cy5BcnJheVR5cGVOb2RlPm5vZGU7XG4gICAgICAgIHJldHVybiByZWNvcmRFbnRyeShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX19zeW1ib2xpYzogJ3JlZmVyZW5jZScsXG4gICAgICAgICAgICAgIG5hbWU6ICdBcnJheScsXG4gICAgICAgICAgICAgIGFyZ3VtZW50czogW3RoaXMuZXZhbHVhdGVOb2RlKGFycmF5VHlwZU5vZGUuZWxlbWVudFR5cGUpXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk51bGxLZXl3b3JkOlxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UcnVlS2V5d29yZDpcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuRmFsc2VLZXl3b3JkOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuUGFyZW50aGVzaXplZEV4cHJlc3Npb246XG4gICAgICAgIGNvbnN0IHBhcmVudGhlc2l6ZWRFeHByZXNzaW9uID0gPHRzLlBhcmVudGhlc2l6ZWRFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgIHJldHVybiB0aGlzLmV2YWx1YXRlTm9kZShwYXJlbnRoZXNpemVkRXhwcmVzc2lvbi5leHByZXNzaW9uKTtcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UeXBlQXNzZXJ0aW9uRXhwcmVzc2lvbjpcbiAgICAgICAgY29uc3QgdHlwZUFzc2VydGlvbiA9IDx0cy5UeXBlQXNzZXJ0aW9uPm5vZGU7XG4gICAgICAgIHJldHVybiB0aGlzLmV2YWx1YXRlTm9kZSh0eXBlQXNzZXJ0aW9uLmV4cHJlc3Npb24pO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlByZWZpeFVuYXJ5RXhwcmVzc2lvbjpcbiAgICAgICAgY29uc3QgcHJlZml4VW5hcnlFeHByZXNzaW9uID0gPHRzLlByZWZpeFVuYXJ5RXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICBjb25zdCBvcGVyYW5kID0gdGhpcy5ldmFsdWF0ZU5vZGUocHJlZml4VW5hcnlFeHByZXNzaW9uLm9wZXJhbmQpO1xuICAgICAgICBpZiAoaXNEZWZpbmVkKG9wZXJhbmQpICYmIGlzUHJpbWl0aXZlKG9wZXJhbmQpKSB7XG4gICAgICAgICAgc3dpdGNoIChwcmVmaXhVbmFyeUV4cHJlc3Npb24ub3BlcmF0b3IpIHtcbiAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5QbHVzVG9rZW46XG4gICAgICAgICAgICAgIHJldHVybiArKG9wZXJhbmQgYXMgYW55KTtcbiAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5NaW51c1Rva2VuOlxuICAgICAgICAgICAgICByZXR1cm4gLShvcGVyYW5kIGFzIGFueSk7XG4gICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuVGlsZGVUb2tlbjpcbiAgICAgICAgICAgICAgcmV0dXJuIH4ob3BlcmFuZCBhcyBhbnkpO1xuICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkV4Y2xhbWF0aW9uVG9rZW46XG4gICAgICAgICAgICAgIHJldHVybiAhb3BlcmFuZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbGV0IG9wZXJhdG9yVGV4dDogJysnfCctJ3wnfid8JyEnO1xuICAgICAgICBzd2l0Y2ggKHByZWZpeFVuYXJ5RXhwcmVzc2lvbi5vcGVyYXRvcikge1xuICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5QbHVzVG9rZW46XG4gICAgICAgICAgICBvcGVyYXRvclRleHQgPSAnKyc7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTWludXNUb2tlbjpcbiAgICAgICAgICAgIG9wZXJhdG9yVGV4dCA9ICctJztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UaWxkZVRva2VuOlxuICAgICAgICAgICAgb3BlcmF0b3JUZXh0ID0gJ34nO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkV4Y2xhbWF0aW9uVG9rZW46XG4gICAgICAgICAgICBvcGVyYXRvclRleHQgPSAnISc7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoe19fc3ltYm9saWM6ICdwcmUnLCBvcGVyYXRvcjogb3BlcmF0b3JUZXh0LCBvcGVyYW5kOiBvcGVyYW5kfSwgbm9kZSk7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbjpcbiAgICAgICAgY29uc3QgYmluYXJ5RXhwcmVzc2lvbiA9IDx0cy5CaW5hcnlFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgIGNvbnN0IGxlZnQgPSB0aGlzLmV2YWx1YXRlTm9kZShiaW5hcnlFeHByZXNzaW9uLmxlZnQpO1xuICAgICAgICBjb25zdCByaWdodCA9IHRoaXMuZXZhbHVhdGVOb2RlKGJpbmFyeUV4cHJlc3Npb24ucmlnaHQpO1xuICAgICAgICBpZiAoaXNEZWZpbmVkKGxlZnQpICYmIGlzRGVmaW5lZChyaWdodCkpIHtcbiAgICAgICAgICBpZiAoaXNQcmltaXRpdmUobGVmdCkgJiYgaXNQcmltaXRpdmUocmlnaHQpKVxuICAgICAgICAgICAgc3dpdGNoIChiaW5hcnlFeHByZXNzaW9uLm9wZXJhdG9yVG9rZW4ua2luZCkge1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCB8fCA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQW1wZXJzYW5kQW1wZXJzYW5kVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCAmJiA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQW1wZXJzYW5kVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCAmIDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5CYXJUb2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0IHwgPGFueT5yaWdodDtcbiAgICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNhcmV0VG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCBeIDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5FcXVhbHNFcXVhbHNUb2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0ID09IDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5FeGNsYW1hdGlvbkVxdWFsc1Rva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgIT0gPGFueT5yaWdodDtcbiAgICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkVxdWFsc0VxdWFsc0VxdWFsc1Rva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgPT09IDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5FeGNsYW1hdGlvbkVxdWFsc0VxdWFsc1Rva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgIT09IDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5MZXNzVGhhblRva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgPCA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuR3JlYXRlclRoYW5Ub2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0ID4gPGFueT5yaWdodDtcbiAgICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkxlc3NUaGFuRXF1YWxzVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCA8PSA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuR3JlYXRlclRoYW5FcXVhbHNUb2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0ID49IDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5MZXNzVGhhbkxlc3NUaGFuVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55PmxlZnQpIDw8ICg8YW55PnJpZ2h0KTtcbiAgICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkdyZWF0ZXJUaGFuR3JlYXRlclRoYW5Ub2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0ID4+IDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5HcmVhdGVyVGhhbkdyZWF0ZXJUaGFuR3JlYXRlclRoYW5Ub2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0ID4+PiA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuUGx1c1Rva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgKyA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTWludXNUb2tlbjpcbiAgICAgICAgICAgICAgICByZXR1cm4gPGFueT5sZWZ0IC0gPGFueT5yaWdodDtcbiAgICAgICAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkFzdGVyaXNrVG9rZW46XG4gICAgICAgICAgICAgICAgcmV0dXJuIDxhbnk+bGVmdCAqIDxhbnk+cmlnaHQ7XG4gICAgICAgICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5TbGFzaFRva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgLyA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuUGVyY2VudFRva2VuOlxuICAgICAgICAgICAgICAgIHJldHVybiA8YW55PmxlZnQgJSA8YW55PnJpZ2h0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZWNvcmRFbnRyeShcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIF9fc3ltYm9saWM6ICdiaW5vcCcsXG4gICAgICAgICAgICAgICAgb3BlcmF0b3I6IGJpbmFyeUV4cHJlc3Npb24ub3BlcmF0b3JUb2tlbi5nZXRUZXh0KCksXG4gICAgICAgICAgICAgICAgbGVmdDogbGVmdCxcbiAgICAgICAgICAgICAgICByaWdodDogcmlnaHRcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQ29uZGl0aW9uYWxFeHByZXNzaW9uOlxuICAgICAgICBjb25zdCBjb25kaXRpb25hbEV4cHJlc3Npb24gPSA8dHMuQ29uZGl0aW9uYWxFeHByZXNzaW9uPm5vZGU7XG4gICAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IHRoaXMuZXZhbHVhdGVOb2RlKGNvbmRpdGlvbmFsRXhwcmVzc2lvbi5jb25kaXRpb24pO1xuICAgICAgICBjb25zdCB0aGVuRXhwcmVzc2lvbiA9IHRoaXMuZXZhbHVhdGVOb2RlKGNvbmRpdGlvbmFsRXhwcmVzc2lvbi53aGVuVHJ1ZSk7XG4gICAgICAgIGNvbnN0IGVsc2VFeHByZXNzaW9uID0gdGhpcy5ldmFsdWF0ZU5vZGUoY29uZGl0aW9uYWxFeHByZXNzaW9uLndoZW5GYWxzZSk7XG4gICAgICAgIGlmIChpc1ByaW1pdGl2ZShjb25kaXRpb24pKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbmRpdGlvbiA/IHRoZW5FeHByZXNzaW9uIDogZWxzZUV4cHJlc3Npb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KHtfX3N5bWJvbGljOiAnaWYnLCBjb25kaXRpb24sIHRoZW5FeHByZXNzaW9uLCBlbHNlRXhwcmVzc2lvbn0sIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkZ1bmN0aW9uRXhwcmVzc2lvbjpcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5BcnJvd0Z1bmN0aW9uOlxuICAgICAgICByZXR1cm4gcmVjb3JkRW50cnkoZXJyb3JTeW1ib2woJ0xhbWJkYSBub3Qgc3VwcG9ydGVkJywgbm9kZSksIG5vZGUpO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLlRhZ2dlZFRlbXBsYXRlRXhwcmVzc2lvbjpcbiAgICAgICAgcmV0dXJuIHJlY29yZEVudHJ5KFxuICAgICAgICAgICAgZXJyb3JTeW1ib2woJ1RhZ2dlZCB0ZW1wbGF0ZSBleHByZXNzaW9ucyBhcmUgbm90IHN1cHBvcnRlZCBpbiBtZXRhZGF0YScsIG5vZGUpLCBub2RlKTtcbiAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5UZW1wbGF0ZUV4cHJlc3Npb246XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlRXhwcmVzc2lvbiA9IDx0cy5UZW1wbGF0ZUV4cHJlc3Npb24+bm9kZTtcbiAgICAgICAgaWYgKHRoaXMuaXNGb2xkYWJsZShub2RlKSkge1xuICAgICAgICAgIHJldHVybiB0ZW1wbGF0ZUV4cHJlc3Npb24udGVtcGxhdGVTcGFucy5yZWR1Y2UoXG4gICAgICAgICAgICAgIChwcmV2aW91cywgY3VycmVudCkgPT4gcHJldmlvdXMgKyA8c3RyaW5nPnRoaXMuZXZhbHVhdGVOb2RlKGN1cnJlbnQuZXhwcmVzc2lvbikgK1xuICAgICAgICAgICAgICAgICAgPHN0cmluZz50aGlzLmV2YWx1YXRlTm9kZShjdXJyZW50LmxpdGVyYWwpLFxuICAgICAgICAgICAgICB0aGlzLmV2YWx1YXRlTm9kZSh0ZW1wbGF0ZUV4cHJlc3Npb24uaGVhZCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0ZW1wbGF0ZUV4cHJlc3Npb24udGVtcGxhdGVTcGFucy5yZWR1Y2UoKHByZXZpb3VzLCBjdXJyZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBleHByID0gdGhpcy5ldmFsdWF0ZU5vZGUoY3VycmVudC5leHByZXNzaW9uKTtcbiAgICAgICAgICAgIGNvbnN0IGxpdGVyYWwgPSB0aGlzLmV2YWx1YXRlTm9kZShjdXJyZW50LmxpdGVyYWwpO1xuICAgICAgICAgICAgaWYgKGlzRm9sZGFibGVFcnJvcihleHByKSkgcmV0dXJuIGV4cHI7XG4gICAgICAgICAgICBpZiAoaXNGb2xkYWJsZUVycm9yKGxpdGVyYWwpKSByZXR1cm4gbGl0ZXJhbDtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcHJldmlvdXMgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBleHByID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiBsaXRlcmFsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICByZXR1cm4gcHJldmlvdXMgKyBleHByICsgbGl0ZXJhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCByZXN1bHQgPSBleHByO1xuICAgICAgICAgICAgaWYgKHByZXZpb3VzICE9PSAnJykge1xuICAgICAgICAgICAgICByZXN1bHQgPSB7X19zeW1ib2xpYzogJ2Jpbm9wJywgb3BlcmF0b3I6ICcrJywgbGVmdDogcHJldmlvdXMsIHJpZ2h0OiBleHByfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChsaXRlcmFsICE9ICcnKSB7XG4gICAgICAgICAgICAgIHJlc3VsdCA9IHtfX3N5bWJvbGljOiAnYmlub3AnLCBvcGVyYXRvcjogJysnLCBsZWZ0OiByZXN1bHQsIHJpZ2h0OiBsaXRlcmFsfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSwgdGhpcy5ldmFsdWF0ZU5vZGUodGVtcGxhdGVFeHByZXNzaW9uLmhlYWQpKTtcbiAgICAgICAgfVxuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkFzRXhwcmVzc2lvbjpcbiAgICAgICAgY29uc3QgYXNFeHByZXNzaW9uID0gPHRzLkFzRXhwcmVzc2lvbj5ub2RlO1xuICAgICAgICByZXR1cm4gdGhpcy5ldmFsdWF0ZU5vZGUoYXNFeHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNsYXNzRXhwcmVzc2lvbjpcbiAgICAgICAgcmV0dXJuIHtfX3N5bWJvbGljOiAnY2xhc3MnfTtcbiAgICB9XG4gICAgcmV0dXJuIHJlY29yZEVudHJ5KGVycm9yU3ltYm9sKCdFeHByZXNzaW9uIGZvcm0gbm90IHN1cHBvcnRlZCcsIG5vZGUpLCBub2RlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1Byb3BlcnR5QXNzaWdubWVudChub2RlOiB0cy5Ob2RlKTogbm9kZSBpcyB0cy5Qcm9wZXJ0eUFzc2lnbm1lbnQge1xuICByZXR1cm4gbm9kZS5raW5kID09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBc3NpZ25tZW50O1xufVxuXG5jb25zdCBlbXB0eSA9IHRzLmNyZWF0ZU5vZGVBcnJheTxhbnk+KCk7XG5cbmZ1bmN0aW9uIGFycmF5T3JFbXB0eTxUIGV4dGVuZHMgdHMuTm9kZT4odjogdHMuTm9kZUFycmF5PFQ+fCB1bmRlZmluZWQpOiB0cy5Ob2RlQXJyYXk8VD4ge1xuICByZXR1cm4gdiB8fCBlbXB0eTtcbn0iXX0=