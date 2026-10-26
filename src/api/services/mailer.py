"""Транзакционная почта (сброс пароля и т.п.) через SMTP."""

import logging
from email.message import EmailMessage

import aiosmtplib

logger = logging.getLogger(__name__)


class MailerNotConfigured(RuntimeError):
    pass


def _require_settings(settings) -> tuple[str, int, str, str, str]:
    host = settings.smtp_host
    user = settings.smtp_user
    password = settings.smtp_password
    sender = settings.smtp_from or user
    if not host or not user or not password or not sender:
        raise MailerNotConfigured("SMTP is not configured (smtp_host/smtp_user/smtp_password)")
    return host, settings.smtp_port, user, password, sender


async def send_email(settings, *, to: str, subject: str, text: str, html: str | None = None) -> None:
    host, port, user, password, sender = _require_settings(settings)

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text, subtype="plain", charset="utf-8")
    if html:
        message.add_alternative(html, subtype="html", charset="utf-8")

    await aiosmtplib.send(
        message,
        hostname=host,
        port=port,
        username=user,
        password=password,
        use_tls=settings.smtp_use_ssl,
        start_tls=settings.smtp_use_tls,
        timeout=60.0,
    )
    logger.info("Transactional email sent to %s (subject=%r)", to, subject)


async def send_password_reset(settings, *, to: str, reset_url: str) -> None:
    text = (
        "Здравствуйте!\n\n"
        "Вы запросили восстановление доступа к Collabrama / CreatorFlow CRM.\n"
        "Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n\n"
        f"{reset_url}\n\n"
        "Если вы не запрашивали восстановление, просто проигнорируйте это письмо — "
        "ваш пароль останется прежним.\n\n"
        "— Команда Collabrama"
    )
    html = f"""\
<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">
  <p>Здравствуйте!</p>
  <p>Вы запросили восстановление доступа к Collabrama / CreatorFlow CRM.</p>
  <p style="margin:24px 0">
    <a href="{reset_url}" style="background:#6366f1;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Задать новый пароль</a>
  </p>
  <p style="color:#6b7280;font-size:13px">Ссылка действует 1 час. Если кнопка не работает, скопируйте адрес в браузер:<br>{reset_url}</p>
  <p style="color:#6b7280;font-size:13px">Если вы не запрашивали восстановление, просто проигнорируйте это письмо — ваш пароль останется прежним.</p>
  <p>— Команда Collabrama</p>
</body></html>"""
    await send_email(settings, to=to, subject="Collabrama — восстановление доступа", text=text, html=html)
