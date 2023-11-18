declare global {
  interface Function {
    selfCall(thisArg: any, ...argArray: any[]): any;
    selfBind(thisArg: any, ...argArray: any[]): any;
    selfApply(thisArg: any, ...argArray: any[]): any;
  }
}
Function.prototype.selfCall = function (thisArg: any, ...argArray: any[]) {
  thisArg = typeof thisArg === "object" ? thisArg : window;
  // 防止覆盖原属性
  const key = Symbol();
  // 这里的this为需要执行的方法
  thisArg[key] = this;
  const result = thisArg[key](...argArray);
  delete thisArg[key];
  return result;
};

Function.prototype.selfBind = function (thisArg: any, ...argArray: any[]) {
  const key = Symbol();
  thisArg[key] = this;
  return function (...args1: any[]) {
    const result = thisArg[key](...argArray, ...args1);
    delete thisArg[key];
    return result;
  };
};

Function.prototype.selfApply = function (thisArg: any, ...argArray: any[]) {
  thisArg = typeof thisArg === "object" ? thisArg : window;
  const key = Symbol();
  thisArg[key] = this;
  const result = thisArg[key](...argArray);
  delete thisArg[key];
  return result;
};
