from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_alter_user_username"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="last_username_change",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp of the most recent username change.",
                null=True,
            ),
        ),
    ]
