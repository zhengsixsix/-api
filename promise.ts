// promise 的实现
// 首先将三种状态提出来，用枚举管理
enum State {
  PENDING = "pending",
  FULFILLED = "fulfilled",
  REJECTED = "rejected",
}

type Resolve<T> = (value?: T | PromiseLike<T>) => void;
type Reject = (reason?: any) => void;
type onFulfilled<T, TResult1> =
  | ((value: T) => TResult1 | PromiseLike<TResult1>)
  | undefined
  | null;

type onRejected<TResult2> =
  | ((reason: any) => TResult2 | PromiseLike<TResult2>)
  | undefined
  | null;

const isFunction = (value: any): value is Function =>
  typeof value === "function";
class SelfPromise<T> {
  // 保存onFulfilled 回调函数
  onFulfilledCallback: Resolve<T>[] = [];
  // 保存onRejected 回调函数
  onRejectedCallback: Reject[] = [];
  // 存储状态值
  status = State.PENDING;
  // 成功后的值
  value!: T;
  // 失败之后的原因
  reason!: T;

  constructor(executor) {
    try {
      executor(this.resolve, this.reject);
    } catch (error) {
      this.reject(error);
    }
  }
  // 箭头函数可以使函数里面的 this 始终指向 Promise 实例对象
  resolve: Resolve<T> = (value) => {
    // 只有状态是 pending 的情况下，才改变为 fulfilled 状态
    if (this.status === State.PENDING) {
      this.status = State.FULFILLED;
      this.value = value as T;
      // 执行onFulfilled回调函数
      this.onFulfilledCallback.length > 0 &&
        this.onFulfilledCallback.forEach((fn) => fn(value));
    }
  };

  reject: Reject = (reason) => {
    // 只有状态是 pending 的情况下，才改变为 fulfilled 状态
    if (this.status === State.PENDING) {
      this.status = State.REJECTED;
      this.reason = reason;
      // 执行 onRejected 回调函数
      this.onRejectedCallback.length > 0 &&
        this.onRejectedCallback.forEach((fn) => fn(reason));
    }
  };

  /**
   * [注册 fulfilled 状态 / rejected 状态 对应的回调函数]
   * @param {function} onFulfilled fulfilled状态时 执行的函数
   * @param {function} onRejected rejected状态时 执行的函数
   * @returns {function} newPromsie 返回一个新的promise对象
   */
  then = <TResult1 = T, TResult2 = never>(
    onFulfilled?: onFulfilled<T, TResult1>,
    onRejected?: onRejected<TResult2>
  ): SelfPromise<TResult1 | TResult2> => {
    /**
     * 参数校验：Promise规定then方法里面的两个参数如果不是函数的话就要被忽略
     * 所谓“忽略”并不是什么都不干，
     * 对于onFulfilled来说“忽略”就是将value原封不动的返回，
     * 对于onRejected来说就是返回拒因，
     * onRejected因为是错误分支，我们返回拒因时应该throw一个Error
     */
    onFulfilled = isFunction(onFulfilled)
      ? onFulfilled
      : (value) => {
          return value as any;
        };
    onRejected = isFunction(onRejected)
      ? onRejected
      : (reason) => {
          throw reason;
        };

    const promise2 = new SelfPromise<TResult1 | TResult2>((resolve, reject) => {
      const fulfilledMicrotask = () => {
        queueMicrotask(() => {
          try {
            // 如果返回的也是一个promise 就递归一下
            if (
              this.value &&
              onFulfilled != null &&
              typeof (this.value as unknown as PromiseLike<T>).then ===
                "function"
            ) {
              resolvePromise(
                null,
                this.value as unknown as PromiseLike<T>,
                onFulfilled as Resolve<T>,
                onRejected as Reject
              );
            } else {
              try {
                const v = onFulfilled?.(this.value)!;
                resolvePromise(promise2, v, resolve, reject);
              } catch (error) {
                reject(error);
              }
            }
          } catch (error) {
            reject(error);
          }
        });
      };

      const rejectedMicrotask = () => {
        queueMicrotask(() => {
          const v = onRejected?.(this.reason)!;
          resolvePromise(promise2, v, resolve, reject);
        });
      };

      if (this.status === State.FULFILLED) {
        // 异步执行 resolve 回调函数
        fulfilledMicrotask();
      } else if (this.status === State.REJECTED) {
        // 异步执行 rejected 回调函数
        rejectedMicrotask();
      } else {
        // pending 状态下保存回调函数 添加订阅者（异步执行的回调函数）
        this.onFulfilledCallback.push(onFulfilled as Resolve<T>);
        this.onRejectedCallback.push(onRejected!);
      }
    });
    // 返回一个promise对象
    return promise2;
  };
}
export default SelfPromise




const resolvePromise = <T>(
  promise2: SelfPromise<T> | null,
  value: T | PromiseLike<T>,
  resolve?: Resolve<T>,
  reject?: Reject
): void => {
  // 2.3.1 规范 如果 promise 和 x 指向同一对象，以 TypeError 为据因拒绝执行 reject
  if (promise2 === value) {
    reject?.(new TypeError("Chaining cycle detected for promise #<Promise>"));
  }
  if (typeof value === "object" || typeof value === "function") {
    // 如果返回值是 null，
    // 直接调用 resolve 函数，promise2 的状态变为 fulfilled，
    // 返回值由下一个 then 方法的第一个回调函数接收。
    if (value === null) return resolve?.(value);

    // called 变量控制thanable 对象只调用resolve 或 reject 函数一次
    let called = false;
    const then = (value as PromiseLike<T>).then;
    try {
      if (value instanceof Promise && typeof value.then === "function") {
        // 如果返回值是 Promise 对象或者 thenable 对象
        // 那就只能交给它们的 then 方法来改变 promise2 的状态，以及获取相对应的状态值
        // 以下代码等同于 value.then((value) => resolve(value), (err) => reject(err))
        queueMicrotask(() => {
          then.call(
            value,
            (value2: PromiseLike<T>) => {
              // 调用了 resolve，called 设为 true，防止再一次调用 reject
              if (called) return;
              called = true;
              // value2 可能是 Promise 对象，所以需要调用 resolvePromise 函数来进行处理
              resolvePromise(promise2, value2, resolve, reject);
            },
            (err: any) => {
              if (called) return;
              // 错误处理，会调用 reject，called 设为 true，防止再一次调用 reolve
              called = true;
              reject?.(err);
            }
          );
        });
      } else {
        // 如果 then 不是函数，同 null 情况一样的处理逻辑。
        resolve?.(value)!;
      }
    } catch (error) {
      reject?.(error)!;
    }
  } else {
    resolve?.(value)!;
  }
};
