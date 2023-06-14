// !代理数组
// 存储副作用函数的桶
const bucket = new WeakMap();
// 用于存储for...in循环副作用的key值
const ITERATE_KEY = Symbol();
// 用一个全局变量存储当前激活的 effect 函数
// 用来判断receiver是否是target的代理对象
const RAW_KEY = Symbol();
let activeEffect;
// effect 栈
const effectStack = [];
// 定义⼀个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();
// ⼀个标记变量，代表是否进⾏追踪。默认值为 true，即允许追踪
let shouldTrack = true;

function track(target, key) {
  if (!activeEffect || !shouldTrack) return;
  let targetMap = bucket.get(target);
  if (!targetMap) {
    bucket.set(target, (targetMap = new Map()));
  }
  let effectsSet = targetMap.get(key);
  if (!effectsSet) {
    targetMap.set(key, (effectsSet = new Set()));
  }
  effectsSet.add(activeEffect);
  activeEffect.effectsSets.push(effectsSet);
}
function trigger(target, key, type, newVal) {
  const targetMap = bucket.get(target);
  if (!targetMap) return;

  const effectsSet = targetMap.get(key);
  const effectsToRun = new Set();

  effectsSet &&
    effectsSet.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });

  // 如果是添加或删除属性，触发for...in循环副作用
  if (type === "ADD" || type === "DELETE") {
    const iterateEffects = targetMap.get(ITERATE_KEY);
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  }

  // 当操作类型为 ADD 并且⽬标对象是数组时，应该取出并执⾏那些与 length属性相关联的副作⽤函数
  if (type === "ADD" && Array.isArray(target)) {
    const lengthEffects = targetMap.get("length");
    lengthEffects &&
      lengthEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  }

  // 如果操作⽬标是数组，并且修改了数组的 length 属性
  if (Array.isArray(target) && key === "length") {
    // 对于索引⼤于或等于新的 length 值的元素
    // 需要把所有相关联的副作⽤函数取出并添加到 effectsToRun 中待执⾏
    // !需要注意map数据结构的forEach方法的参数值
    targetMap.forEach((effectsSet, key) => {
      if (key >= newVal) {
        effectsSet.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn);
          }
        });
      }
    });
  }

  effectsToRun.forEach((effectFn) => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

function registerEffect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    // 当调用 effect 注册副作用函数时，将副作用函数复制给 activeEffect
    activeEffect = effectFn;
    // 在调用副作用函数之前将当前副作用函数压栈
    effectStack.push(effectFn);
    const res = fn();
    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并还原 activeEffect 为之前的值
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];

    return res;
  };
  // 将 options 挂在到 effectFn 上
  effectFn.options = options;
  // activeEffect.deps 用来存储所有与该副作用函数相关的依赖集合
  effectFn.effectsSets = [];
  // 执行副作用函数
  if (!options.lazy) {
    effectFn();
  }

  return effectFn;
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.effectsSets.length; i++) {
    const effectsSet = effectFn.effectsSets[i];
    effectsSet.delete(effectFn);
  }
  effectFn.effectsSets.length = 0;
}

function reactive(obj) {
  // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象;
  const existionProxy = reactiveMap.get(obj);
  if (existionProxy) return existionProxy;
  // 否则，创建新的代理对象
  const proxy = createReactive(obj);
  // 存储到 Map 中，从⽽避免重复创建
  reactiveMap.set(obj, proxy);
  return proxy;
}
function shallowReactive(obj) {
  return createReactive(obj, true);
}

function readonly(obj) {
  return createReactive(obj, false, true);
}
function shallowReadonly(obj) {
  return createReactive(obj, true, false);
}

const arrayInstrumentations = {};

["includes", "indexOf", "lastIndexOf"].forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
    let res = originMethod.apply(this, args);

    if (res === false) {
      // res 为 false 说明没找到，在通过 this[RAW_KEY] 拿到原始数组，再去原始数组中查找，并更新 res 值
      res = originMethod.apply(this[RAW_KEY], args);
    }
    // 返回最终的结果
    return res;
  };
});
// 重写数组的 push、pop、shift等⽅法
["push", "pop", "shift", "unshift", "splice"].forEach((method) => {
  // 取得原始 push ⽅法
  const originMethod = Array.prototype[method];
  // 重写
  arrayInstrumentations[method] = function (...args) {
    // 在调⽤原始⽅法之前，禁⽌追踪
    shouldTrack = false;
    // push ⽅法的默认⾏为
    let res = originMethod.apply(this, args);
    // 在调⽤原始⽅法之后，恢复原来的⾏为，即允许追踪
    shouldTrack = true;
    return res;
  };
});

function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      if (key === RAW_KEY) {
        return target;
      }
      //  如果操作的⽬标对象是数组，并且 key 存在于arrayInstrumentations 上
      //  那么返回定义在 arrayInstrumentations 上的值，如访问includes属性时，会返回自定义includes方法
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }
      // ⾮只读的时候才需要建⽴响应联系
      // 添加判断，如果 key 的类型是 symbol，则不进⾏追踪
      if (!isReadonly && typeof key !== "symbol") {
        track(target, key);
      }
      // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
      const res = Reflect.get(target, key, receiver);

      // 如果是浅响应，则直接返回原始值
      if (isShallow) {
        return res;
      }
      if (typeof res === "object" && res !== null) {
        // 如果数据为只读，则调⽤ readonly 对值进⾏包装
        return isReadonly ? readonly(res) : reactive(res);
      }
      return res;
    },
    // 拦截设置操作
    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }
      const oldVal = target[key];
      // 如果属性不存在，则说明是在添加新的属性，否则是设置已存在的属性
      let type = "";
      if (Array.isArray(target)) {
        // 检测被设置的索引值是否⼩于数组⻓度。如果是，则视作 SET 操作
        if (Number(key) < target.length) {
          type = "SET";
        } else {
          type = "ADD";
        }
      } else {
        type = Object.prototype.hasOwnProperty.call(target, key)
          ? "SET"
          : "ADD";
      }
      // 设置属性值
      const res = Reflect.set(target, key, newVal, receiver);
      if (target === receiver[RAW_KEY]) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          // 增加第四个参数，即触发响应的新值
          trigger(target, key, type, newVal);
        }
      }
      return res;
    },
    // 处理in操作符
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    //  处理for...in循环
    ownKeys(target) {
      // 如果操作⽬标 target 是数组，则使⽤ length 属性作为 key 并建⽴ 响应联系
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
    // 处理delete操作符
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const res = Reflect.deleteProperty(target, key);
      if (res && hadKey) {
        trigger(target, key, "DELETE", newVal);
      }
      return res;
    },
  });
}
