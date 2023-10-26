// promise 的实现
// 首先将三种状态提出来，用枚举管理
enum State {
  PENDING = "pending",
  FULFILLED = "fulfilled",
  REJECTED = "rejected",
}

class SelfPromise<T> {
  // 保存onFulfilled 回调函数
  onFulfilledCallback: ((value: T) => void) | null = null;
  // 保存onRejected 回调函数
  onRejectedCallback: ((reason: T) => void) | null = null;
  // 存储状态值
  status = State.PENDING;
  // 成功后的值
  value = null;
  // 失败之后的原因
  reason = null;

  constructor(executor) {
    executor(this.resolve, this.reject);
  }
  // 箭头函数可以使函数里面的 this 始终指向 Promise 实例对象
  resolve = (value) => {
    // 只有状态是 pending 的情况下，才改变为 fulfilled 状态
    if (this.status === State.PENDING) {
      this.status = State.FULFILLED;
      this.value = value;
      // 执行onFulfilled回调函数
      this.onFulfilledCallback && this.onFulfilledCallback(value);
    }
  };
  reject = (reason) => {
    // 只有状态是 pending 的情况下，才改变为 fulfilled 状态
    if (this.status === State.PENDING) {
      this.status = State.REJECTED;
      this.reason = reason;
      // 执行 onRejected 回调函数
      this.onRejectedCallback && this.onRejectedCallback(reason);
    }
  };
  then = (onFulfilled, onRejected) => {
    if (this.status === State.FULFILLED) {
      onFulfilled(this.value);
    } else if (this.status === State.REJECTED) {
      onRejected(this.reason);
    } else {
      // pending 状态下保存回调函数
      this.onFulfilledCallback = onFulfilled;
      this.onRejectedCallback = onRejected;
    }
  };
}
