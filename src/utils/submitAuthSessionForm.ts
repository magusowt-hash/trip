/**
 * 用浏览器原生表单 POST 到 /api/auth/session，服务端返回 303 + Set-Cookie + Location=/explore。
 * 比 fetch + window.location 更可靠：避免 cookie 尚未进入文档导航请求、地址栏仍停在 /login 的问题。
 */
export function submitAuthSessionForm(token: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/auth/session';
  form.enctype = 'application/x-www-form-urlencoded';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'token';
  input.value = token;
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
}
