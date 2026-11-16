from django.urls import path

from .views import (
    UserLibraryDetail,
    UserLibraryList,
)

urlpatterns = [
    path("library/", UserLibraryList.as_view(), name="library-get-add"),
    path("library/<int:game_id>/", UserLibraryDetail.as_view(), name="library-delete")
]
