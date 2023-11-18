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
type Executor<T> = (resolve?: Resolve<T>, reject?: Reject) => void;

type onFinally = (() => void) | undefined | null;

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

  constructor(executor: Executor<T>) {
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
                reject?.(error);
              }
            }
          } catch (error) {
            reject?.(error);
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

  static resolve = <T>(value?: T | PromiseLike<T>): SelfPromise<T> => {
    // 如果这个值是一个 promise ，那么将返回这个 promise
    if (value instanceof SelfPromise) {
      return value;
    }
    return new SelfPromise((resolve) => this.resolve?.(resolve));
  };

  static reject = <T = never>(reason?: any): SelfPromise<T> => {
    return new SelfPromise((resolve, reject) => {
      reject?.(reason);
    });
  };

  //catch 方法等同于 then(null, onRejected) 或 then(undefined, onRejected)
  public catch = <TResult = never>(
    onrejected?: onRejected<TResult>
  ): SelfPromise<T | TResult> => {
    return this.then(null, onrejected);
  };

  /**
   * Promise.prototype.finally()
   * @param {*} onfinally 无论结果是fulfilled或者是rejected，都会执行的回调函数
   * @returns
   */
  // 无论如何都会执行，不会传值给回调函数
  public finally = (onfinally?: onFinally): SelfPromise<T> => {
    return this.then(
      (value) =>
        SelfPromise.resolve(
          isFunction(onfinally) ? onfinally() : onfinally
        ).then(() => {
          return value;
        }),
      (reason) =>
        SelfPromise.resolve(
          isFunction(onfinally) ? onfinally() : onfinally
        ).then(() => {
          throw reason;
        })
    );
  };

  /**
   * Promise.all()
   * @param {iterable} promises 一个promise的iterable类型（注：Array，Map，Set都属于ES6的iterable类型）的输入
   * @returns
   */
  static all = <T>(promises: readonly T[]): SelfPromise<T[]> => {
    return new SelfPromise((resolve, reject) => {
      if (Array.isArray(promises)) {
        let result: T[] = [];
        let count = 0;
        if (promises.length === 0) {
          return resolve?.(promises);
        }
        promises.forEach((item, index) => {
          // MyPromise.resolve方法中已经判断了参数是否为promise与thenable对象，所以无需在该方法中再次判断
          SelfPromise.resolve(item).then(
            (value) => {
              count++;
              // 每个promise执行的结果存储在result中
              result[index] = value;
              // Promise.all 等待所有都完成（或第一个失败）
              if (count === promises.length) {
                resolve?.(result);
              }
            },
            (reason) => {
              /**
               * 如果传入的 promise 中有一个失败（rejected），
               * Promise.all 异步地将失败的那个结果给失败状态的回调函数，而不管其它 promise 是否完成
               */
              reject?.(reason);
            }
          );
        });
      } else {
        return reject?.(new TypeError("Argument is not iterable"));
      }
    });
  };

  static race = <T>(promises: readonly T[]): SelfPromise<T[]> => {
    return new SelfPromise((resolve, reject) => {
      if (Array.isArray(promises)) {
        // 如果传入的迭代promises是空的，则返回的 promise 将永远等待。
        if (promises.length) {
          promises.forEach((item) => {
            /**
             * 如果迭代包含一个或多个非承诺值和/或已解决/拒绝的承诺，
             * 则 Promise.race 将解析为迭代中找到的第一个值。
             */
            SelfPromise.resolve(item).then(resolve, reject);
          });
        }
      } else {
        return reject?.(new TypeError("Argument is not iterable"));
      }
    });
  };

  static allSettled = <T>(
    promises: readonly T[]
  ): SelfPromise<PromiseSettledResult<Awaited<T>>[]> => {
    return new SelfPromise((resolve, reject) => {
      if (Array.isArray(promises)) {
        let result: any[] = []; // 存储结果
        let count = 0; // 计数器
        if (promises.length === 0) return resolve?.(promises);
        promises.forEach((item, index) => {
          SelfPromise.resolve(item).then(
            (value) => {
              count++;
              result[index] = { status: "fulfilled", value };
              if (count === promises.length) {
                resolve?.(result);
              }
            },
            (reason) => {
              count++;
              result[index] = { status: "rejected", reason };
              if (count === promises.length) {
                resolve?.(result);
              }
            }
          );
        });
      } else {
        return reject?.(new TypeError("Argument is not iterable"));
      }
    });
  };

  static any = <T>(promises: readonly T[]): SelfPromise<T[]> => {
    return new SelfPromise((resolve, reject) => {
      if (Array.isArray(promises)) {
        let errors: any[] = []; //
        let count = 0; // 计数器
        if (promises.length === 0) {
          return reject?.(new Error("All promises were rejected"));
        }
        promises.forEach((item, index) => {
          SelfPromise.resolve(item).then(
            (value) => {
              // 只要其中的一个 promise 成功，就返回那个已经成功的 promise
              resolve?.(value);
            },
            (reason) => {
              count++;
              errors.push(reason);
              /**
               * 如果可迭代对象中没有一个 promise 成功，就返回一个失败的 promise 和 AggregateError 类型的实例，
               * AggregateError是 Error 的一个子类，用于把单一的错误集合在一起。
               */
              if (count === promises.length) {
                reject?.(new Error("All promises were rejected"));
              }
            }
          );
        });
      } else {
        reject?.(new TypeError("Argument is not iterable"));
      }
    });
  };
}
export default SelfPromise;

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
