// 存储副作用函数的桶
const bucket = new WeakMap();
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
function trigger(target, key) {
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

// =========================

const obj = {
  foo: 1,
  get bar() {
    return this.foo;
  },
};

// 对原始数据的代理
const p = new Proxy(obj, {
  // 拦截读取操作
  get(target, key, receiver) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    track(target, key);
    // 返回属性值
    return Reflect.get(target, key, receiver);
    // return target[key]; // !丢失响应式
  },
  // 拦截设置操作
  set(target, key, newVal) {
    // 设置属性值
    target[key] = newVal;
    // 把副作用函数从桶里取出并执行
    trigger(target, key);
  },
});

registerEffect(() => {
  console.log(p.bar);
});

p.foo++;
