# Generated by Django 3.1.3 on 2020-11-29 00:48

from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "1004_sanity_check_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="archive_checksum",
            field=models.CharField(
                blank=True,
                editable=False,
                help_text="The checksum of the archived document.",
                max_length=32,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="document",
            name="checksum",
            field=models.CharField(
                editable=False,
                help_text="The checksum of the original document.",
                max_length=32,
                unique=True,
            ),
        ),
    ]
