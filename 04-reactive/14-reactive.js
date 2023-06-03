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

function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
  if (typeof value !== "object" || value === null || seen.has(val)) return;
  // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value);
  // 暂时不考虑数组等其他结构
  // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const k in value) {
    traverse(value[k], seen);
  }
  return value;
}

function watch(source, cb, options = {}) {
  let getter;
  // 如果 source 是函数，说明用户传递的是 getter，所以直接把 source 赋值给 getter
  if (typeof source === "function") {
    getter = source;
  } else {
    // 否则按照原来的实现调用 traverse 递归地读取
    getter = () => traverse(source);
  }
  // 定义新值和旧值
  let oldValue, newValue;
  // cleanup 用来存储用户注册的过期回调
  let cleanup;
  // 定义 onInvalidate 函数
  function onInvalidate(fn) {
    // 将过期回调存储到 cleanup 中
    cleanup = fn;
  }
  const job = () => {
    // 在 scheduler 中重新执⾏副作⽤函数，得到的是新值
    newValue = effectFn();
    // 在调用回调函数 cb 之前，先调用过期回调
    if (cleanup) {
      cleanup();
    }
    // 将 onInvalidate 作为回调函数的第三个参数，以便用户使用
    cb(newValue, oldValue, onInvalidate);
    // 更新旧值，不然下⼀次会得到错误的旧值
    oldValue = newValue;
  };
  // 使⽤ effect 注册副作⽤函数时，开启 lazy 选项，并把返回值存储到effectFn 中以便后续⼿动调⽤
  const effectFn = registerEffect(
    // 执行getter
    () => getter(),
    {
      lazy: true,
      scheduler() {
        // 在调度函数中判断 flush 是否为 'post'，如果是，将其放到微任务队列中执行,从而实现异步延迟执行
        if (options.flush === "post") {
          const p = Promise.resolve();
          p.then(job);
        } else {
          job();
        }
      },
    }
  );
  if (options.immediate) {
    // 当 immediate 为 true 时立即执行 job，从而触发回调执行
    job();
  } else {
    // ⼿动调⽤副作⽤函数，拿到的值就是旧值
    oldValue = effectFn();
  }
}
