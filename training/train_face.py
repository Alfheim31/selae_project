import os
import random
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
from facenet_pytorch import InceptionResnetV1

class MultiAngleTripletDataset(Dataset):
    def __init__(self, root_dir, transform=None):
        self.transform = transform
        self.identities = {}
        for sid in sorted(os.listdir(root_dir)):
            p = os.path.join(root_dir, sid)
            if os.path.isdir(p):
                imgs = [os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(".jpg")]
                if len(imgs) >= 2:
                    self.identities[sid] = imgs
        self.sids = list(self.identities.keys())
        print(f"Loaded {len(self.sids)} students ({sum(len(v) for v in self.identities.values())} cropped faces).")

    def __len__(self):
        return len(self.sids) * 16

    def __getitem__(self, idx):
        anchor_sid = self.sids[idx % len(self.sids)]
        neg_sid = random.choice([s for s in self.sids if s != anchor_sid])

        anchor_path, pos_path = random.sample(self.identities[anchor_sid], 2)
        neg_path = random.choice(self.identities[neg_sid])

        imgs = [Image.open(p).convert("RGB") for p in (anchor_path, pos_path, neg_path)]
        if self.transform:
            imgs = [self.transform(im) for im in imgs]
        return imgs[0], imgs[1], imgs[2]

class SelaeFaceEmbedder(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = InceptionResnetV1(pretrained="vggface2")
        for param in list(self.backbone.parameters())[:-20]:
            param.requires_grad = False
        self.proj = nn.Linear(512, 128)

    def forward(self, x):
        feat = self.backbone(x)
        emb = self.proj(feat)
        return F.normalize(emb, p=2, dim=1)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Training on: {device}")

tf = transforms.Compose([
    transforms.Resize((160, 160)),
    transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.2),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
])

dataset = MultiAngleTripletDataset("dataset_cropped", transform=tf)
loader = DataLoader(dataset, batch_size=16, shuffle=True)

model = SelaeFaceEmbedder().to(device)
criterion = nn.TripletMarginLoss(margin=0.4, p=2)
optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-4, weight_decay=1e-3)

model.train()
for epoch in range(20):
    total_loss = 0.0
    for anchor, pos, neg in loader:
        anchor, pos, neg = anchor.to(device), pos.to(device), neg.to(device)
        optimizer.zero_grad()
        loss = criterion(model(anchor), model(pos), model(neg))
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    print(f"Epoch {epoch+1:02d}/20 | Triplet Loss: {total_loss / len(loader):.4f}")

# Export to ONNX for SELAE
model.eval().cpu()
dummy_input = torch.randn(1, 3, 160, 160)
os.makedirs("public/models", exist_ok=True)
torch.onnx.export(
    model,
    dummy_input,
    "public/models/selae_custom_face.onnx",
    input_names=["input"],
    output_names=["embedding"],
    dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
    opset_version=17,
)
print("Saved public/models/selae_custom_face.onnx")