document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#submit-status').textContent = '测试完成。这个示例不会发送任何资料。';
});
