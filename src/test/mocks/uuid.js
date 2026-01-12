// Mock uuid module for Jest tests
let counter = 0;

module.exports = {
  v4: () => {
    counter++;
    return `mock-uuid-${counter.toString().padStart(4, '0')}`;
  }
};