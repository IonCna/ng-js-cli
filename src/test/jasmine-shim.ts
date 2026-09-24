/**
 * La API de Jasmine que usan los specs de Angular (`spyOn`, `jasmine.createSpy`/`createSpyObj`/`addMatchers`, `.and.*`,
 * `.calls.*`, `jasmine.any`/`objectContaining`/…, `xit`/`fit`, `fail`, `toBeTrue`/`toHaveBeenCalledOnceWith`/…) sobre
 * los globals de Vitest (`vi`, `expect`, `it`, `describe`): un spy es un `vi.fn()`/`vi.spyOn()` con `and` y `calls`
 * encima, así también sirven `vi`, `toHaveBeenCalledWith` y compañía. Como en Jasmine, `spyOn` no llama al original
 * (`.and.callThrough()` para eso) y se restaura solo después de cada test (`restoreMocks`, en `TestCommand`).
 *
 * Fuera a propósito: el callback `done` (un `it("x", ({ expect }) => …)` de Vitest no se distingue de un
 * `it("x", (done) => …)`) y `jasmine.clock()` (es terreno de `fakeAsync`).
 *
 * JS plano: corre como setup file de Vitest, sin imports.
 */
export class JasmineShim {
  static source(): string {
    return `(function () {
  if (globalThis.jasmine) return;
  var vi = globalThis.vi;
  var expect = globalThis.expect;

  function decorate(spy, original) {
    spy.and = {
      returnValue: function (value) { spy.mockImplementation(function () { return value; }); return spy; },
      returnValues: function () {
        var values = Array.prototype.slice.call(arguments);
        var index = 0;
        spy.mockImplementation(function () { return values[index++]; });
        return spy;
      },
      callFake: function (fn) { spy.mockImplementation(fn); return spy; },
      callThrough: function () {
        spy.mockImplementation(function () { return original ? original.apply(this, arguments) : undefined; });
        return spy;
      },
      throwError: function (error) {
        spy.mockImplementation(function () { throw typeof error === "string" ? new Error(error) : error; });
        return spy;
      },
      resolveTo: function (value) { spy.mockImplementation(function () { return Promise.resolve(value); }); return spy; },
      rejectWith: function (error) { spy.mockImplementation(function () { return Promise.reject(error); }); return spy; },
      stub: function () { spy.mockImplementation(function () { return undefined; }); return spy; },
    };
    function all() {
      return spy.mock.calls.map(function (args, index) {
        var result = spy.mock.results[index];
        return { object: spy.mock.contexts[index], args: args, returnValue: result && result.value };
      });
    }
    spy.calls = {
      any: function () { return spy.mock.calls.length > 0; },
      count: function () { return spy.mock.calls.length; },
      argsFor: function (index) { return spy.mock.calls[index] || []; },
      allArgs: function () { return spy.mock.calls.slice(); },
      all: all,
      first: function () { return all()[0]; },
      mostRecent: function () { var calls = all(); return calls[calls.length - 1]; },
      reset: function () { spy.mockClear(); },
    };
    return spy;
  }

  function createSpy(name, original) {
    // Como Jasmine: original solo cuenta para and.callThrough(); por default el spy no hace nada.
    var spy = decorate(vi.fn(), original);
    if (name) spy.mockName(name);
    return spy;
  }

  function createSpyObj(baseName, methodNames, propertyNames) {
    if (typeof baseName !== "string") {
      propertyNames = methodNames;
      methodNames = baseName;
      baseName = "unknown";
    }
    var object = {};
    var methods = Array.isArray(methodNames) ? methodNames : Object.keys(methodNames || {});
    methods.forEach(function (method) {
      object[method] = createSpy(baseName + "." + method);
      if (!Array.isArray(methodNames)) object[method].and.returnValue(methodNames[method]);
    });
    var properties = Array.isArray(propertyNames) ? propertyNames : Object.keys(propertyNames || {});
    properties.forEach(function (property) {
      object[property] = Array.isArray(propertyNames) ? undefined : propertyNames[property];
    });
    return object;
  }

  globalThis.spyOn = function (object, method) {
    var original = object[method];
    return decorate(vi.spyOn(object, method), original).and.stub();
  };

  globalThis.spyOnProperty = function (object, property, accessType) {
    var access = accessType || "get";
    var descriptor;
    for (var target = object; target && !descriptor; target = Object.getPrototypeOf(target)) {
      descriptor = Object.getOwnPropertyDescriptor(target, property);
    }
    var original = descriptor && descriptor[access];
    return decorate(vi.spyOn(object, property, access), original).and.stub();
  };

  // jasmine.addMatchers({ nombre: (util) => ({ compare, negativeCompare? }) }) → expect.extend. Con negativeCompare,
  // su pass es el de la negación: Vitest invierte el resultado en .not, así que se devuelve al revés.
  function addMatchers(factories) {
    var matchers = {};
    Object.keys(factories).forEach(function (name) {
      matchers[name] = function (received) {
        var expected = Array.prototype.slice.call(arguments, 1);
        var matcher = factories[name]({ equals: this.equals });
        var negative = this.isNot && typeof matcher.negativeCompare === "function";
        var outcome = (negative ? matcher.negativeCompare : matcher.compare).apply(matcher, [received].concat(expected));
        var context = this;
        return {
          pass: negative ? !outcome.pass : outcome.pass,
          message: function () {
            return outcome.message || "expected " + context.utils.printReceived(received) + (context.isNot ? " not" : "") + " to pass " + name;
          },
        };
      };
    });
    expect.extend(matchers);
  }

  globalThis.jasmine = {
    createSpy: createSpy,
    createSpyObj: createSpyObj,
    addMatchers: addMatchers,
    any: expect.any,
    anything: expect.anything,
    objectContaining: expect.objectContaining,
    arrayContaining: expect.arrayContaining,
    stringMatching: expect.stringMatching,
    stringContaining: expect.stringContaining,
  };

  globalThis.fail = function (error) {
    throw error instanceof Error ? error : new Error(error === undefined ? "Failed" : String(error));
  };
  globalThis.xit = globalThis.it.skip;
  globalThis.xdescribe = globalThis.describe.skip;
  globalThis.fit = globalThis.it.only;
  globalThis.fdescribe = globalThis.describe.only;

  function result(context, pass, what) {
    return {
      pass: pass,
      message: function () { return "expected " + context.utils.printReceived(what) + (context.isNot ? " not" : "") + " to pass"; },
    };
  }

  expect.extend({
    toBeTrue: function (received) {
      return { pass: received === true, message: () => "expected " + this.utils.printReceived(received) + (this.isNot ? " not" : "") + " to be true" };
    },
    toBeFalse: function (received) {
      return { pass: received === false, message: () => "expected " + this.utils.printReceived(received) + (this.isNot ? " not" : "") + " to be false" };
    },
    toHaveBeenCalledOnceWith: function (spy) {
      var expected = Array.prototype.slice.call(arguments, 1);
      var calls = spy.mock.calls;
      return result(this, calls.length === 1 && this.equals(calls[0], expected), calls);
    },
    toHaveSize: function (received, size) {
      var actual = received == null ? undefined
        : received.length !== undefined ? received.length
        : received.size !== undefined ? received.size
        : Object.keys(received).length;
      return { pass: actual === size, message: () => "expected size " + actual + (this.isNot ? " not" : "") + " to be " + size };
    },
    toHaveClass: function (element, className) {
      var pass = !!(element && element.classList && element.classList.contains(className));
      return { pass: pass, message: () => "expected element" + (this.isNot ? " not" : "") + " to have class " + className };
    },
  });
})();`;
  }
}
