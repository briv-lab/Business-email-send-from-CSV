import smtplib
import csv
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = "mail.infomaniak.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER")
EMAIL_PASSWORD = os.getenv("SMTP_PASS")

NAME = "Briac"

def send_email(server, to: str, subject: str, body: str, html: bool = False):
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{NAME} de Edichoix" f"<{SMTP_USER}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html" if html else "plain"))
    server.sendmail(SMTP_USER, to, msg.as_string())
    print(f"✓ Envoyé à {to}")

def send_from_csv(csv_path: str):
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, EMAIL_PASSWORD)

        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f, skipinitialspace=True)
            for row in reader:

                subject = "Objet de l'email"
                body = f"""
<p>Bonjour {row['prénom']},</p>
<p>Je me permets de vous contacter au sujet de nos solutions pour optimiser votre prospection commerciale.<br>
N’hésitez pas à me répondre pour en discuter ou convenir d’un rendez-vous.</p>
<p>Cordialement,<br>
Briac de Edichoix</p>
<p>
    <img src='' alt='Logo Edichoix' style='width:37%; max-width:200px;'>
</p>
"""

                send_email(server, row["email"], subject, body, html=True)

send_from_csv("prospects.csv")