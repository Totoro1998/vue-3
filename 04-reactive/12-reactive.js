/**
 * 设计一个完善的响应系统
 * ! 计算属性与lazy
 */

// 存储副作用函数的桶
const bucket = new WeakMap();
// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 副作用函数栈 effectStack
const effectStack = [];
// 原始数据
const data = { foo: 1, bar: 2 };

// 对原始数据的代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    track(target, key);
    return target[key];
  },
  // 拦截设置操作
  set(target, key, newVal) {
    target[key] = newVal;
    // 把副作用函数从桶里取出并执行
    trigger(target, key);
  },
});

function track(target, key) {
  if (!activeEffect) return;
  let targetMap = bucket.get(target);
  if (!targetMap) {
    targetMap = new Map();
    bucket.set(target, targetMap);
  }
  let effectSet = targetMap.get(key);
  if (!effectSet) {
    effectSet = new Set();
    targetMap.set(key, effectSet);
  }
  // 把当前激活的副作用函数添加到依赖集合effectSet中
  effectSet.add(activeEffect);
  // effectSet 就是一个与当前副作用函数存在联系的依赖集合
  // 只有在每次track时才将其添加到 activeEffect.effectSets 数组中
  activeEffect.effectSets.push(effectSet);
}

function trigger(target, key) {
  const targetMap = bucket.get(target);
  if (!targetMap) {
    return;
  }
  const effectSet = targetMap.get(key);

  const effectsToRun = new Set();
  effectSet &&
    effectSet.forEach((effectFn) => {
      // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  effectsToRun.forEach((effectFn) => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
  //   effectSet && effectSet.forEach((fn) => fn());
}

// 注册副作用函数
function registerEffect(fn, options = {}) {
  const effectFn = () => {
    // 在trigger中每运行一次副作用函数后就调用cleanup进行清除
    // 然后在track中重新添加副作用
    cleanup(effectFn);
    // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
    activeEffect = effectFn;
    // 在调用副作用函数之前将当前副作用函数压入栈中
    effectStack.push(effectFn);
    const res = fn();
    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  effectFn.options = options;
  effectFn.effectSets = []; // effectSets用来存储所有包含当前副作用函数的依赖集合
  // 只有非 lazy 的时候，才执行
  if (!options.lazy) {
    effectFn();
  }
  // 将副作用函数作为返回值返回
  return effectFn;
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.effectSets.length; i++) {
    // effectSet是依赖集合
    const effectSet = effectFn.effectSets[i];
    // 将effectFn从依赖集合中删除
    effectSet.delete(effectFn);
  }
  // 最后需要充值effectFn.deps数组
  effectFn.effectSets.length = 0;
}

function computed(getters) {
  // value 用来缓存上一次计算的值
  let value;
  // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着“脏”，需要计算
  let dirty = true;
  const effectFn = registerEffect(getters, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
        trigger(obj, "value");
      }
    },
  });
  const obj = {
    //只有当读取 value 的值时，才会执行 effectFn 并将其结果作为返回值返回。
    get value() {
      // 只有“脏”时才计算值，并将得到的值缓存到 value 中
      if (dirty) {
        // 将 dirty 设置为 false，下一次访问直接使用缓存到 value 中的值
        value = effectFn();
        dirty = false;
      }
      track(obj, "value");
      return value;
    },
  };
  return obj;
}
