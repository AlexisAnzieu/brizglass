import type React from "react";
import "./styles.css";
import { Analytics } from "@vercel/analytics/next"

export const metadata = {
	description:
		"Apprenez à vous connaître grâce à des jeux de devinettes amusants !",
	title: "Brizglass - Jeu de Team Building",
};

export default async function RootLayout(props: { children: React.ReactNode }) {
	const { children } = props;

	return (
		<html lang="fr">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto+Mono:wght@500&display=swap" rel="stylesheet" />
			</head>
			<body>
				<main>{children}</main>
				        <Analytics />

			</body>
		</html>
	);
}
