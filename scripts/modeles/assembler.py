"""Recadre les rendus de sortie/ et les écrit en WebP dans le jeu.

Les parcelles partagent un même cadre (la réunion de leurs contours), pour
que la terre tombe au même endroit dans chaque image. Les icônes sont
centrées dans un carré de 160 px ; celles qui viennent de Fluent Emoji
(licence MIT) sont téléchargées dans fluent/.

Usage : python3 assembler.py   (après node rendre.mjs ; il faut Pillow)
"""
import os
import urllib.request
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, 'sortie')
FLUENT = os.path.join(ICI, 'fluent')
IMAGES = os.path.join(ICI, '..', '..', 'src', 'main', 'resources', 'static', 'images')
MODELES = os.path.join(IMAGES, 'modeles')
OBJETS = os.path.join(IMAGES, 'objets')
SOURCE_FLUENT = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/'

PARCELLES = ['parcelle'] + [f'{f}-{s}' for f in ('cereales', 'houblon', 'baies', 'herbes') for s in (1, 2, 3)]

# icône du jeu -> rendu maison (sortie/…-i.png) ou emoji Fluent
ICONES = {
    'coin': 'Coin', 'CEREAL': 'icone-gerbe-i', 'HONEY': 'Honey pot', 'HOP': 'icone-houblon-i',
    'HERB': 'Herb', 'FRUIT': 'Red apple', 'SPICE': 'Hot pepper', 'YEAST': 'icone-levure-i',
    'WATER': 'Droplet', 'OTHER': 'Amphora', 'barrel': 'fut-en-cours-i', 'star': 'Star',
    'BEER': 'Beer mug', 'MEAD': 'icone-corne-i', 'CIDER': 'Bottle with popping cork',
    'hive': 'ruche-i', 'field': 'cereales-3-i', 'crate': 'Basket', 'vat': 'fut-pret-i',
    'flask': 'Alembic', 'scroll': 'Scroll',
}


def contour(image, seuil=6):
    return image.getchannel('A').point(lambda a: 255 if a > seuil else 0).getbbox()


def fluent(nom):
    fichier = nom.lower().replace(' ', '_') + '_3d.png'
    chemin = os.path.join(FLUENT, fichier)
    if not os.path.exists(chemin):
        os.makedirs(FLUENT, exist_ok=True)
        url = SOURCE_FLUENT + nom.replace(' ', '%20') + '/3D/' + fichier
        urllib.request.urlretrieve(url, chemin)
    return Image.open(chemin).convert('RGBA')


def carre(image, cote):
    image = image.crop(contour(image, 8))
    w, h = image.size
    c = max(w, h)
    m = int(c * .04)
    fond = Image.new('RGBA', (c + 2 * m, c + 2 * m), (0, 0, 0, 0))
    fond.paste(image, ((c - w) // 2 + m, (c - h) // 2 + m))
    return fond.resize((cote, cote), Image.LANCZOS)


def main():
    os.makedirs(MODELES, exist_ok=True)
    os.makedirs(OBJETS, exist_ok=True)

    rendus = {n: Image.open(os.path.join(SORTIE, n + '.png')).convert('RGBA') for n in PARCELLES}
    boites = [contour(i) for i in rendus.values()]
    cadre = (min(b[0] for b in boites), min(b[1] for b in boites), max(b[2] for b in boites), max(b[3] for b in boites))
    for nom, image in rendus.items():
        image.crop(cadre).save(os.path.join(MODELES, nom + '.webp'), 'WEBP', quality=82, method=6)

    for nom in ('fut-en-cours', 'fut-pret', 'ruche', 'ruche-pleine'):
        image = Image.open(os.path.join(SORTIE, nom + '.png')).convert('RGBA')
        image = image.crop(contour(image))
        image.thumbnail((360, 360), Image.LANCZOS)
        image.save(os.path.join(MODELES, nom + '.webp'), 'WEBP', quality=84, method=6)

    abeille = fluent('Honeybee')
    abeille = abeille.crop(contour(abeille))
    abeille.thumbnail((48, 48), Image.LANCZOS)
    fond = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
    fond.paste(abeille, ((48 - abeille.width) // 2, (48 - abeille.height) // 2))
    fond.save(os.path.join(MODELES, 'abeille.webp'), 'WEBP', quality=88, method=6)

    for icone, source in ICONES.items():
        if source.endswith('-i'):
            image = Image.open(os.path.join(SORTIE, source + '.png')).convert('RGBA')
        else:
            image = fluent(source)
        carre(image, 160).save(os.path.join(OBJETS, icone + '.webp'), 'WEBP', quality=86, method=6)


if __name__ == '__main__':
    main()
