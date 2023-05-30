const map = new Map();

map.set(5, new Set());
map.set(2, new Set());
map.set(4, new Set());
map.set(3, new Set());
map.set(1, new Set());

map.forEach((item, index) => {
  //   console.log(item);
  console.log(index);
});
