// 存储副作用函数的桶
const bucket = new WeakMap();
// 用于存储for...in循环副作用的key值
const ITERATE_KEY = Symbol();
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

function reactive(obj) {
  return createReactive(obj);
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

function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      // !代理对象可以通过 raw 属性访问原始数据
      if (key === "raw") {
        return target;
      }
      // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
      const res = Reflect.get(target, key, receiver);
      // ⾮只读的时候才需要建⽴响应联系
      if (!isReadonly) {
        track(target, key);
      }
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
      const type = Object.prototype.hasOwnProperty.call(target, key)
        ? "SET"
        : "ADD";
      // 设置属性值
      const res = Reflect.set(target, key, newVal, receiver);
      // ! target === receiver.raw 说明 receiver 就是 target 的代理对象
      //! 访问receiver的属性会走get拦截操作
      if (target === receiver.raw) {
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
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const res = Reflect.deleteProperty(target, key);
      if (res && hadKey) {
        trigger(target, key, "DELETE");
      }
      return res;
    },
  });
}

const obj = { foo: { bar: 1 } };

const proxy = readonly(obj);

registerEffect(() => {
  console.log(proxy.foo.bar);
});
proxy.foo.bar = proxy.foo.bar + 1;

console.log(bucket);

/**
 *
 * 0: {Object => Map(1)}
 *  key: {bar: 1}
 *  value: Map(1) {'bar' => Set(1)}
 * 1:
 *  {Object => Map(1)}
 *  key: {foo: {…}}
 *  value: Map(1) {'foo' => Set(1)}
 */
