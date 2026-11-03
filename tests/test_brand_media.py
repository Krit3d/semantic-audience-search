import pytest
from pydantic import ValidationError

from src.api.schemas import BrandKb, BrandProduct


def test_brand_and_product_media_are_independent() -> None:
    kb = BrandKb(
        logo_url="/media/brand-logo.png",
        products=[
            BrandProduct(
                name="Первый продукт",
                product_url="https://example.test/first",
                sku="FIRST-1",
                logo_url="/media/first-logo.png",
                gallery=["/media/first-1.png", "/media/first-2.png"],
                selected_image="/media/first-2.png",
            ),
            BrandProduct(
                name="Второй продукт",
                product_url="https://example.test/second",
                sku="SECOND-2",
                logo_url="/media/second-logo.png",
                gallery=["/media/second-1.png"],
                selected_image="/media/second-1.png",
            ),
        ],
    )
    restored = BrandKb.model_validate(kb.model_dump())
    assert restored.logo_url == "/media/brand-logo.png"
    assert restored.products[0].product_url == "https://example.test/first"
    assert restored.products[0].sku == "FIRST-1"
    assert restored.products[0].logo_url == "/media/first-logo.png"
    assert restored.products[0].gallery == ["/media/first-1.png", "/media/first-2.png"]
    assert restored.products[1].product_url == "https://example.test/second"
    assert restored.products[1].sku == "SECOND-2"
    assert restored.products[1].logo_url == "/media/second-logo.png"
    assert restored.products[1].gallery == ["/media/second-1.png"]


def test_product_gallery_accepts_five_images() -> None:
    gallery = [f"/media/image-{index}.png" for index in range(5)]
    product = BrandProduct(gallery=gallery)
    assert product.gallery == gallery


def test_product_gallery_rejects_sixth_image() -> None:
    with pytest.raises(ValidationError):
        BrandProduct(gallery=[f"/media/image-{index}.png" for index in range(6)])
