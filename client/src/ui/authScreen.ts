import type { AppContext } from './context';
import { errorMessage, h } from './dom';

export function renderAuth(root: HTMLElement, ctx: AppContext): void {
  let mode: 'login' | 'register' = 'login';

  const username = h('input', { placeholder: 'Pseudo', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', required: true });
  const hint = h('p', { class: 'hint', hidden: true }, 'Pseudo : 3 à 20 lettres, chiffres ou _ · Mot de passe : 8 caractères minimum');
  const error = h('p', { class: 'error' });
  const submit = h('button', { type: 'submit' }, 'Se connecter');
  const toggle = h('button', { type: 'button', class: 'link' }, "Pas encore de compte ? S'inscrire");

  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    submit.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    toggle.textContent = mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter';
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    hint.hidden = mode === 'login';
    error.textContent = '';
  });

  const form = h(
    'form',
    {
      class: 'panel auth',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          const res =
            mode === 'login'
              ? await ctx.api.login(username.value, password.value)
              : await ctx.api.register(username.value, password.value);
          ctx.session.save(res.token, res.username);
          ctx.go({ name: 'characters' });
        } catch (err) {
          error.textContent = errorMessage(err);
        } finally {
          submit.disabled = false;
        }
      },
    },
    h('h1', {}, 'RPG Online'),
    username,
    password,
    hint,
    error,
    submit,
    toggle,
  );

  root.append(h('div', { class: 'screen' }, form));
  username.focus();
}
