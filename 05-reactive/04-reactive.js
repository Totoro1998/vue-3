// !浅响应与深响应

// 存储副作用函数的桶
const bucket = new WeakMap();
// 用于存储for...in循环副作用的key值
const ITERATE_KEY = Symbol();
// 用来判断receiver是否是target的代理对象
const RAW_KEY = Symbol();
// 用一个全局变量存储当前激活的 effect 函数
let activeEffect;
// effect 栈
const effectStack = [];

function track(target, key) {
  if (!activeEffect) return;
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
function trigger(target, key, type) {
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

function createReactive(obj, isShallow = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      if (key === RAW_KEY) {
        return target;
      }
      // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
      const res = Reflect.get(target, key, receiver);
      track(target, key);
      // 如果是浅响应，则直接返回原始值
      if (isShallow) {
        return res;
      }
      if (typeof res === "object" && res !== null) {
        return reactive(res);
      }
      return res;
    },
    // 拦截设置操作
    set(target, key, newVal, receiver) {
      const oldVal = target[key];
      // 如果属性不存在，则说明是在添加新的属性，否则是设置已存在的属性
      const type = Object.prototype.hasOwnProperty.call(target, key)
        ? "SET"
        : "ADD";
      // 设置属性值
      const res = Reflect.set(target, key, newVal, receiver);
      if (target === receiver[RAW_KEY]) {
        // 将 type 作为第三个参数传递给 trigger 函数
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type);
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
      track(target, ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
    // 处理delete操作符
    deleteProperty(target, key) {
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const res = Reflect.deleteProperty(target, key);
      if (res && hadKey) {
        trigger(target, key, "DELETE");
      }
      return res;
    },
  });
}

function reactive(obj) {
  return createReactive(obj);
}
function shallowReactive(obj) {
  return createReactive(obj, true);
}

// 测试

const obj = { foo: { bar: 1 } };

const proxy = reactive(obj);

registerEffect(() => {
  console.log(proxy.foo.bar);
});

const proxy1 = shallowReactive(obj);

registerEffect(() => {
  console.log(proxy1.foo.bar);
});

proxy.foo.bar = 2;
proxy1.foo.bar = 2;
