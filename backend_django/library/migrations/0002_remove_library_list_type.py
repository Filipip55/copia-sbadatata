from django.db import migrations, models


def delete_library_entries(apps, schema_editor):
    """La lista "library" non esiste più: eliminiamo le righe rimaste."""
    UserLibrary = apps.get_model("library", "UserLibrary")
    UserLibrary.objects.filter(list_type="library").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(delete_library_entries, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='userlibrary',
            name='list_type',
            field=models.CharField(choices=[('favorites', 'Favorites'), ('wishlist', 'Wishlist')], max_length=20),
        ),
    ]
