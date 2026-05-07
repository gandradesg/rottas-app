# Configuração de Emails no Supabase

Para que os Gerentes consigam definir senha no primeiro acesso, é preciso ajustar 2 coisas no Supabase Dashboard:

## 1. DESATIVAR confirmação de email (importante!)

Por padrão o Supabase exige confirmar email antes do usuário poder logar. Como **você (master) controla todas as contas**, isso é desnecessário e atrapalha o fluxo de primeiro acesso.

**Caminho:**
1. Acesse: https://lmzjlirzexyopnjxohez.supabase.co/project/_/auth/providers
2. Clique em **Email** na lista de providers
3. **Desative** a opção `Confirm email`
4. Clique em **Save**

> Resultado: o email "Confirm Your Signup" não será mais enviado. O usuário receberá direto o email de "Definir senha" (mais útil).

---

## 2. PERSONALIZAR template de email "Reset Password"

**Caminho:**
1. Acesse: https://lmzjlirzexyopnjxohez.supabase.co/project/_/auth/templates
2. Clique na aba **Reset Password**
3. **Subject heading:** cole:

```
🎉 Bem-vindo à Plataforma de Gerentes Rottas
```

4. **Message body (HTML):** apague o conteúdo e cole:

```html
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFF8F0; border-radius: 12px; overflow: hidden; border: 1px solid #F2E5D5;">
  <div style="background: linear-gradient(135deg, #F26B22, #D5530F); padding: 32px 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 26px; letter-spacing: 1px;">ROTTAS</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">CONSTRUTORA E INCORPORADORA</p>
  </div>

  <div style="padding: 32px 28px; color: #1A1D29;">
    <h2 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800;">🎉 Parabéns!</h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #4A5568;">
      Você foi convidado(a) para acessar o aplicativo de Gerentes de Plataforma da
      <strong style="color: #F26B22;">Rottas Construtora e Incorporadora</strong>.
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4A5568;">
      Seja muito bem-vindo(a)! 👋<br>
      Para começar, clique no botão abaixo e <strong>defina sua senha</strong>:
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="{{ .ConfirmationURL }}"
         style="display: inline-block; background: linear-gradient(135deg, #F26B22, #D5530F); color: white; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(242,107,34,0.35);">
        Definir minha senha →
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 13px; color: #717784; line-height: 1.5;">
      Após definir sua senha, você poderá:
    </p>
    <ul style="font-size: 13px; color: #4A5568; line-height: 1.7; padding-left: 20px;">
      <li>📍 Registrar Check-ins nas imobiliárias</li>
      <li>👥 Cadastrar atendimentos e propostas</li>
      <li>🌐 Lançar contatos via Órulo</li>
      <li>📊 Acompanhar seu funil em tempo real</li>
    </ul>

    <p style="margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #F2E5D5; font-size: 12px; color: #99A0AC; line-height: 1.5;">
      Este link expira em 1 hora. Se você não esperava este convite, pode ignorar este email.<br>
      Em caso de dúvidas, fale com o administrador da plataforma.
    </p>
  </div>

  <div style="background: #F2E5D5; padding: 16px; text-align: center; font-size: 11px; color: #717784;">
    © 2026 Rottas Construtora e Incorporadora · Todos os direitos reservados
  </div>
</div>
```

5. Clique em **Save changes**

---

## 3. (Opcional) Personalizar template "Magic Link"

Se quiser usar magic link (login sem senha), faça o mesmo para a aba **Magic Link**.

---

## 4. (Opcional, mas recomendado) Configurar SMTP próprio

O SMTP padrão do Supabase tem **limite de 2 emails/hora**. Para uso real:

1. Crie conta grátis em **Resend** (https://resend.com) — 3.000 emails/mês grátis
2. Adicione e verifique seu domínio `rottasconstrutora.com.br`
3. No Supabase: **Authentication → Settings → SMTP Settings**, marque **Enable Custom SMTP** e cole as credenciais do Resend
4. Salve

Resultado: emails saem do `noreply@rottasconstrutora.com.br` (ou similar) com a marca da empresa, sem rate limit.
