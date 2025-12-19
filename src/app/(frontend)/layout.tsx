import type React from "react";
import "./styles.css";

export const metadata = {
	description:
		"Apprenez à vous connaître grâce à des jeux de devinettes amusants !",
	title: "Icebreaker - Jeu de Team Building",
};

export default async function RootLayout(props: { children: React.ReactNode }) {
	const { children } = props;

	return (
		<html lang="fr">
			<body>
				<main>{children}</main>
			</body>
		</html>
	);
}
